import { z } from "zod";
import { gradeSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireStaff } from "@/lib/session";

async function assertInProgramme(assessmentId: string, studentId: string) {
  const [a, s] = await Promise.all([
    db.assessment.findUnique({ where: { id: assessmentId }, include: { module: true } }),
    db.student.findUnique({ where: { id: studentId } }),
  ]);
  if (!a || !s) throw new HttpError(404, "Assessment or student not found.");
  if (a.module.programmeId !== s.programmeId) throw new HttpError(400, "Student is not on this module's programme.");
  // Same rule the marksheet UI applies: withdrawn students are not marked.
  if (s.status === "WITHDRAWN") throw new HttpError(409, "Withdrawn students cannot be graded.");
}

// Enter / change a grade.
export const PUT = handle(async (req, { params }) => {
  await requireStaff();
  const { id } = await params;
  const { studentId, score } = gradeSchema.parse(await req.json());
  await assertInProgramme(id, studentId);
  const key = { assessmentId_studentId: { assessmentId: id, studentId } };
  const existing = await db.grade.findUnique({ where: key });
  // Changing an already-published mark withdraws it, so a student never sees a number staff have since revised silently.
  const changed = existing && existing.score !== score;
  const grade = await db.grade.upsert({
    where: key,
    create: { assessmentId: id, studentId, score },
    update: { score, ...(changed ? { published: false, publishedAt: null } : {}) },
  });
  return ok(grade);
});

// studentId is required on purpose: there is no bulk publish, because a bulk action would also release
// results staff are deliberately withholding. Release is always an explicit, per-student decision.
const publishSchema = z.object({ studentId: z.string().min(1), published: z.enum(["true", "false"]).transform((v) => v === "true") });

// Publish / withhold one student's result.
export const PATCH = handle(async (req, { params }) => {
  await requireStaff();
  const { id } = await params;
  const { studentId, published } = publishSchema.parse(await req.json());
  const data = { published, publishedAt: published ? new Date() : null };
  const g = await db.grade.findUnique({ where: { assessmentId_studentId: { assessmentId: id, studentId } } });
  if (!g) throw new HttpError(409, "Enter a grade before publishing.");
  return ok(await db.grade.update({ where: { id: g.id }, data }));
});
