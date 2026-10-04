import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/api";
import { getSession } from "@/lib/session";

export const GET = handle(async (_req, { params }) => {
  const { id } = await params;
  const sub = await db.submission.findUnique({ where: { id } });
  if (!sub) throw new HttpError(404, "Submission not found.");
  const session = await getSession();
  if (session.role === "student" && session.studentRecordId !== sub.studentId) throw new HttpError(403, "Not your submission.");

  const uploadRoot = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./uploads");
  const buf = await readFile(path.join(/* turbopackIgnore: true */ uploadRoot, sub.filePath)).catch(() => {
    throw new HttpError(404, "File is missing from storage.");
  });
  const isPdf = sub.filePath.endsWith(".pdf");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(sub.fileName)}"`,
    },
  });
});
