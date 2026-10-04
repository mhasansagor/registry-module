"use client";
import { useRouter } from "next/navigation";

type S = { id: string; studentId: string; fullName: string };

export default function RoleSwitcher({ role, selectedStudentRecordId, students }: { role: "staff" | "student"; selectedStudentRecordId?: string; students: S[] }) {
  const router = useRouter();

  async function switchTo(nextRole: "staff" | "student", sid?: string) {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole, studentRecordId: sid }),
    });
    router.push(nextRole === "staff" ? "/staff" : "/student");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="sr-only" htmlFor="role">View as</label>
      <select
        id="role"
        className="input w-auto"
        value={role}
        onChange={(e) => switchTo(e.target.value as "staff" | "student", students[0]?.id)}
      >
        <option value="staff">Staff view</option>
        <option value="student">Student view</option>
      </select>
      {role === "student" && (
        <>
          <label className="sr-only" htmlFor="who">Student</label>
          <select id="who" className="input w-auto" value={selectedStudentRecordId} onChange={(e) => switchTo("student", e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.fullName} ({s.studentId})</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
