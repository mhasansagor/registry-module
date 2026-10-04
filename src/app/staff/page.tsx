import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { feeSummary, money, fmtDate, STATUS_LABEL } from "@/lib/util";

export default async function Dashboard() {
  await requireStaff();
  const [students, unpublished, openAssessments] = await Promise.all([
    db.student.findMany({ include: { programme: true, payments: true } }),
    db.grade.count({ where: { published: false } }),
    db.assessment.count({ where: { deadline: { gt: new Date() } } }),
  ]);

  const rows = students.map((s) => ({ s, ...feeSummary(s) }));
  const overdue = rows.filter((r) => r.overdue).sort((a, b) => b.daysOverdue - a.daysOverdue);
  const totalOutstanding = rows.reduce((n, r) => n + Math.max(r.outstanding, 0), 0);
  const overdueTotal = overdue.reduce((n, r) => n + r.outstanding, 0);
  const byStatus = (st: keyof typeof STATUS_LABEL) => students.filter((s) => s.status === st).length;

  return (
    <div className="space-y-6">
      <h1>Registry dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(students.length)} note={`${byStatus("ENROLLED")} enrolled, ${byStatus("DEFERRED")} deferred`} />
        <Stat label="Outstanding fees" value={money(totalOutstanding)} note="across all students" />
        <Stat label="Overdue" value={money(overdueTotal)} note={`${overdue.length} student${overdue.length === 1 ? "" : "s"} past due date`} bad={overdue.length > 0} />
        <Stat label="Results not yet published" value={String(unpublished)} note={`${openAssessments} assessment${openAssessments === 1 ? "" : "s"} still open`} />
      </div>

      <section className="panel">
        <h2 className="mb-3">Overdue balances</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-slate-600">No student is past their fee due date with a balance.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Student</th><th>Programme</th><th>Status</th><th>Due date</th><th>Days overdue</th><th className="text-right">Outstanding</th></tr>
              </thead>
              <tbody>
                {overdue.map(({ s, outstanding, daysOverdue }) => (
                  <tr key={s.id}>
                    <td>
                      <Link className="font-medium text-brand hover:underline" href={`/staff/students/${s.id}`}>{s.fullName}</Link>
                      <div className="text-xs text-slate-500">{s.studentId}</div>
                    </td>
                    <td>{s.programme.code}</td>
                    <td>{STATUS_LABEL[s.status]}</td>
                    <td>{fmtDate(s.feeDueDate)}</td>
                    <td><span className="badge b-bad">{daysOverdue} days</span></td>
                    <td className="text-right font-medium">{money(outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note, bad }: { label: string; value: string; note: string; bad?: boolean }) {
  return (
    <div className={`panel ${bad ? "border-red-200" : ""}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${bad ? "text-red-700" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}
