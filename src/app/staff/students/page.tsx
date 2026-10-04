import Link from "next/link";
import { EnrolmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { feeSummary, money, STATUS_LABEL, toInputDate } from "@/lib/util";
import ApiForm from "@/components/ApiForm";

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; programme?: string; status?: string }> }) {
  await requireStaff();
  const { q = "", programme = "", status = "" } = await searchParams;

  const where: Prisma.StudentWhereInput = {
    ...(q && { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { studentId: { contains: q, mode: "insensitive" } }] }),
    ...(programme && { programmeId: programme }),
    ...(status in STATUS_LABEL && { status: status as EnrolmentStatus }),
  };
  const [students, programmes] = await Promise.all([
    db.student.findMany({ where, orderBy: { studentId: "asc" }, include: { programme: true, payments: true } }),
    db.programme.findMany({ orderBy: { name: "asc" } }),
  ]);
  const in30 = toInputDate(new Date(Date.now() + 30 * 86_400_000));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Students</h1>
      </div>

      <details className="panel">
        <summary className="cursor-pointer text-sm font-medium text-brand">Enrol a new student</summary>
        <ApiForm action="/api/students" submit="Enrol student" className="mt-4 grid gap-3 sm:grid-cols-3">
          <div><label className="label">Full name</label><input name="fullName" required className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
          <div><label className="label">Date of birth</label><input name="dob" type="date" required className="input" /></div>
          <div>
            <label className="label">Programme</label>
            <select name="programmeId" required className="input">
              {programmes.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.fee)})</option>)}
            </select>
          </div>
          <div><label className="label">Academic year</label><input name="academicYear" type="number" defaultValue={new Date().getFullYear()} required className="input" /></div>
          <div>
            <label className="label">Enrolment status</label>
            <select name="status" className="input">
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">Fee due date</label><input name="feeDueDate" type="date" defaultValue={in30} required className="input" /></div>
          <div className="flex items-end sm:col-span-2" />
        </ApiForm>
      </details>

      <form className="panel grid gap-3 sm:grid-cols-4" method="GET">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">Search by name or student ID</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="e.g. Rahman or SMS-2025-0003" />
        </div>
        <div>
          <label className="label" htmlFor="programme">Programme</label>
          <select id="programme" name="programme" defaultValue={programme} className="input">
            <option value="">All programmes</option>
            {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <button className="btn">Apply filters</button>
          <Link href="/staff/students" className="btn-quiet">Clear</Link>
        </div>
      </form>

      <div className="panel overflow-x-auto p-0">
        <table className="tbl">
          <thead>
            <tr><th>Student ID</th><th>Name</th><th>Programme</th><th>Year</th><th>Status</th><th className="text-right">Balance</th></tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">No students match these filters.</td></tr>
            )}
            {students.map((s) => {
              const f = feeSummary(s);
              return (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">{s.studentId}</td>
                  <td><Link className="font-medium text-brand hover:underline" href={`/staff/students/${s.id}`}>{s.fullName}</Link></td>
                  <td>{s.programme.code}</td>
                  <td>{s.academicYear}</td>
                  <td>{STATUS_LABEL[s.status]}</td>
                  <td className="text-right">
                    {f.overdue && <span className="badge b-bad mr-2">Overdue</span>}
                    {money(Math.max(f.outstanding, 0))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
