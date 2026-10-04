import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { fmtDateTime, toInputDateTime } from "@/lib/util";
import ApiForm from "@/components/ApiForm";

export default async function Assessments() {
  await requireStaff();
  const [assessments, modules] = await Promise.all([
    db.assessment.findMany({
      orderBy: { deadline: "desc" },
      include: { module: { include: { programme: true } }, _count: { select: { submissions: true, grades: true } } },
    }),
    db.module.findMany({ orderBy: { code: "asc" }, include: { programme: true } }),
  ]);
  const week = toInputDateTime(new Date(Date.now() + 7 * 86_400_000));

  return (
    <div className="space-y-6">
      <h1>Assessments</h1>

      <details className="panel">
        <summary className="cursor-pointer text-sm font-medium text-brand">Create an assessment</summary>
        <ApiForm action="/api/assessments" submit="Create assessment" className="mt-4 grid gap-3 sm:grid-cols-3">
          <div><label className="label">Title</label><input name="title" required className="input" /></div>
          <div>
            <label className="label">Module</label>
            <select name="moduleId" required className="input">
              {modules.map((m) => <option key={m.id} value={m.id}>{m.code} - {m.title} ({m.programme.code})</option>)}
            </select>
          </div>
          <div><label className="label">Submission deadline</label><input name="deadline" type="datetime-local" defaultValue={week} required className="input" /></div>
        </ApiForm>
      </details>

      <div className="panel overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Assessment</th><th>Module</th><th>Deadline</th><th>Submissions</th><th>Graded</th></tr></thead>
          <tbody>
            {assessments.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No assessments yet. Create the first one above.</td></tr>}
            {assessments.map((a) => {
              const open = a.deadline.getTime() > Date.now();
              return (
                <tr key={a.id}>
                  <td><Link className="font-medium text-brand hover:underline" href={`/staff/assessments/${a.id}`}>{a.title}</Link></td>
                  <td>{a.module.code} <span className="text-slate-500">({a.module.programme.code})</span></td>
                  <td>{fmtDateTime(a.deadline)} <span className={`badge ml-1 ${open ? "b-ok" : "b-mute"}`}>{open ? "Open" : "Closed"}</span></td>
                  <td>{a._count.submissions}</td>
                  <td>{a._count.grades}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
