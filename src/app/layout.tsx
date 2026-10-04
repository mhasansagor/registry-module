import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import RoleSwitcher from "@/components/RoleSwitcher";

export const metadata: Metadata = { title: "Registry | Student Management System" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const students = await db.student.findMany({
    orderBy: { studentId: "asc" },
    select: { id: true, studentId: true, fullName: true },
  });

  return (
    <html lang="en">
      <body className="font-sans">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-6">
              <span className="font-semibold text-brand">Registry</span>
              {session.role === "staff" ? (
                <nav className="flex gap-4 text-sm">
                  <Link href="/staff">Dashboard</Link>
                  <Link href="/staff/students">Students</Link>
                  <Link href="/staff/assessments">Assessments</Link>
                </nav>
              ) : (
                <nav className="flex gap-4 text-sm">
                  <Link href="/student">My record</Link>
                </nav>
              )}
            </div>
            <RoleSwitcher
              role={session.role}
              selectedStudentRecordId={session.role === "student" ? session.studentRecordId : undefined}
              students={students}
            />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
