import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireStudent } from "@/lib/session";

import { detectType, MAX_BYTES } from "@/lib/upload";

const UPLOAD_DIR = () => path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./uploads");

export const POST = handle(async (req, { params }) => {
  const studentRecordId = await requireStudent();
  const { id } = await params;
  const [student, assessment] = await Promise.all([
    db.student.findUnique({ where: { id: studentRecordId } }),
    db.assessment.findUnique({ where: { id }, include: { module: true } }),
  ]);
  if (!student) throw new HttpError(404, "Student not found.");
  if (!assessment) throw new HttpError(404, "Assessment not found.");
  if (assessment.module.programmeId !== student.programmeId) throw new HttpError(403, "This assessment is not part of your programme.");
  if (student.status !== "ENROLLED") throw new HttpError(403, "Only currently enrolled students can submit work.");

  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a PDF or DOCX file to upload.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "File is larger than 10 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectType(file.name, file.type, buf);
  if (!type) throw new HttpError(400, "Only genuine PDF or DOCX files are accepted.");

  const now = new Date();
  const isLate = now > assessment.deadline;
  const existing = await db.submission.findUnique({
    where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.id } },
  });
  // Late work is accepted once, but the deadline closes resubmission (otherwise "late" could be edited forever).
  if (existing && isLate) throw new HttpError(409, "The deadline has passed, so your submission can no longer be replaced.");

  const rel = path.join(assessment.id, `${student.studentId}-${Date.now()}.${type}`);
  const abs = path.join(UPLOAD_DIR(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);

  const data = { fileName: path.basename(file.name), filePath: rel, submittedAt: now, isLate };
  let saved;
  try {
    saved = existing
      ? await db.submission.update({ where: { id: existing.id }, data })
      : await db.submission.create({ data: { ...data, assessmentId: assessment.id, studentId: student.id } });
  } catch (e) {
    await unlink(abs).catch(() => {}); // don't leave an orphaned upload if the DB write fails (e.g. a double-click race)
    throw e;
  }
  if (existing) await unlink(path.join(/* turbopackIgnore: true */ UPLOAD_DIR(), existing.filePath)).catch(() => {});
  return ok(saved, existing ? 200 : 201);
});
