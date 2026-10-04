import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { classify, feeSummary, fmtDate, fmtDateTime, money, STATUS_LABEL } from "@/lib/util";
import ApiForm from "@/components/ApiForm";

export default async function StudentHome() {
  const session = await getSession();
  if (session.role !== "student") {
    return <p className="panel text-sm">You are in the staff view. Use the selector at the top right to switch to a student.</p>;
  }
  const s = await db.student.findUnique({
    where: { id: session.studentRecordId },
    include: { programme: true, payments: true, submissions: true, grades: { where: { published: true } } },
  });
  if (!s) return <p className="panel text-sm">This student record no longer exists. Pick another from the selector.</p>;

  const assessments = await db.assessment.findMany({
    where: { module: { programmeId: s.programmeId } },
    orderBy: { deadline: "asc" },
    include: { module: true },
  });
  const f = feeSummary(s);
  const subs = new Map(s.submissions.map((x) => [x.assessmentId, x]));
  const published = s.grades;
  const canSubmit = s.status === "ENROLLED";

  return (
    <div className="space-y-6">
      <div>
        <h1>{s.fullName}</h1>
        <p className="text-sm text-slate-600">{s.studentId} &middot; {s.programme.name} &middot; {STATUS_LABEL[s.status]}</p>
      </div>

      <section className="panel text-sm">
        <h2 className="mb-2">Fees</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <span>Fee: <b>{money(s.feeAmount)}</b></span>
          <span>Paid: <b>{money(f.paid)}</b></span>
          <span>Outstanding: <b>{money(Math.max(f.outstanding, 0))}</b></span>
          <span>Due: <b>{fmtDate(s.feeDueDate)}</b></span>
          {f.overdue && <span className="badge b-bad">Overdue</span>}
        </div>
      </section>

      <section className="panel p-0">
        <h2 className="p-5 pb-2">Assessments</h2>
        {!canSubmit && <p className="px-5 pb-3 text-sm text-slate-600">Submissions are only available while your status is Enrolled.</p>}
        <table className="tbl">
          <thead><tr><th>Assessment</th><th>Deadline</th><th>Your submission</th><th /></tr></thead>
          <tbody>
            {assessments.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No assessments have been set for your programme yet.</td></tr>}
            {assessments.map((a) => {
              const open = a.deadline.getTime() > Date.now();
              const su = subs.get(a.id);
              const locked = !!su && !open; // deadline passed: existing work can no longer be replaced
              return (
                <tr key={a.id}>
                  <td><div className="font-medium">{a.title}</div><div className="text-xs text-slate-500">{a.module.code}</div></td>
                  <td>{fmtDateTime(a.deadline)} <span className={`badge ml-1 ${open ? "b-ok" : "b-mute"}`}>{open ? "Open" : "Closed"}</span></td>
                  <td>
                    {su ? (
                      <div>{su.fileName}<div className="text-xs text-slate-500">{fmtDateTime(su.submittedAt)} {su.isLate && <span className="badge b-bad ml-1">Late</span>}</div></div>
                    ) : <span className="text-slate-500">Not submitted</span>}
                  </td>
                  <td>
                    {canSubmit && !locked && (
                      <ApiForm action={`/api/assessments/${a.id}/submissions`} multipart submit={su ? "Replace" : open ? "Submit" : "Submit late"} quiet className="flex items-center gap-2">
                        <input name="file" type="file" required accept=".pdf,.docx" className="max-w-[12rem] text-xs" aria-label={`File for ${a.title}`} />
                      </ApiForm>
                    )}
                    {locked && <span className="text-xs text-slate-500">Deadline passed</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel p-0">
        <h2 className="p-5 pb-2">Marksheet</h2>
        <table className="tbl">
          <thead><tr><th>Assessment</th><th>Grade</th><th>Classification</th></tr></thead>
          <tbody>
            {assessments.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-500">No results yet.</td></tr>}
            {assessments.map((a) => {
              const g = published.find((x) => x.assessmentId === a.id);
              return (
                <tr key={a.id}>
                  <td>{a.title} <span className="text-xs text-slate-500">({a.module.code})</span></td>
                  {g ? (
                    <><td className="font-medium">{g.score}</td><td><span className="badge b-mute">{classify(g.score)}</span></td></>
                  ) : (
                    // Unpublished and ungraded look identical on purpose; unpublished rows are not even queried.
                    <td colSpan={2} className="text-slate-500">Not yet released</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
