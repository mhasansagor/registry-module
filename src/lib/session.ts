import { cookies } from "next/headers";
import { HttpError } from "./api";

// Demo-grade role toggle (auth is optional in the brief).
// Cookies are client-settable, so this is NOT security. See README "Known limitations".
export type Session = { role: "staff" } | { role: "student"; studentRecordId: string };

export async function getSession(): Promise<Session> {
  const c = await cookies();
  if (c.get("role")?.value === "student") {
    const studentRecordId = c.get("sid")?.value; // Student.id (internal DB id), not the public SMS-YYYY-NNNN
    if (studentRecordId) return { role: "student", studentRecordId };
  }
  return { role: "staff" };
}

export async function requireStaff() {
  if ((await getSession()).role !== "staff") throw new HttpError(403, "This action is for Registry staff only.");
}

// Returns the internal Student.id of the signed-in student.
export async function requireStudent() {
  const s = await getSession();
  if (s.role !== "student") throw new HttpError(403, "Switch to a student view to do this.");
  return s.studentRecordId;
}
