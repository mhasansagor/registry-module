import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { classify, fmtDateTime, STATUS_LABEL } from "@/lib/util";
import ApiForm from "@/components/ApiForm";

export default async function Marksheet({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const a = await db.assessment.findUnique({
    where: { id },
    include: { module: { include: { programme: true } }, submissions: true, grades: true },
  });
  if (!a) notFound();
  // Withdrawn students are not marked; everyone else on the programme appears on the marksheet.
  const students = await db.student.findMany({
    where: { programmeId: a.module.programmeId, status: { not: "WITHDRAWN" } },
    orderBy: { studentId: "asc" },
  });
  const sub = new Map(a.submissions.map((s) => [s.studentId, s]));
  const grade = new Map(a.grades.map((g) => [g.studentId, g]));
  const open = a.deadline.getTime() > Date.now();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{a.title}</h1>
          <p className="text-sm text-slate-600">
            {a.module.code} - {a.module.title} &middot; Deadline {fmtDateTime(a.deadline)}{" "}
            <span className={`badge ${open ? "b-ok" : "b-mute"}`}>{open ? "Open" : "Closed"}</span>
          </p>
        </div>
      </div>

      <div className="panel overflow-x-auto p-0">
        <table className="tbl">
          <thead>
            <tr><th>Student</th><th>Submission</th><th>Grade (0-100)</th><th>Result</th><th>Visibility</th></tr>
          </thead>
          <tbody>
            {students.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No students on this programme.</td></tr>}
            {students.map((s) => {
              const su = sub.get(s.id);
              const g = grade.get(s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium">{s.fullName}</div>
                    <div className="text-xs text-slate-500">{s.studentId} &middot; {STATUS_LABEL[s.status]}</div>
                  </td>
                  <td>
                    {su ? (
                      <div>
                        <a className="text-brand hover:underline" href={`/api/submissions/${su.id}/file`}>{su.fileName}</a>
                        <div className="text-xs text-slate-500">
                          {fmtDateTime(su.submittedAt)} {su.isLate && <span className="badge b-bad ml-1">Late</span>}
                        </div>
                      </div>
                    ) : (
                      <span className={`badge ${open ? "b-mute" : "b-warn"}`}>{open ? "Not yet submitted" : "No submission"}</span>
                    )}
                  </td>
                  <td>
                    <ApiForm action={`/api/assessments/${a.id}/grades`} method="PUT" submit="Save" quiet keepValues className="flex items-start gap-2">
                      <input type="hidden" name="studentId" value={s.id} />
                      <input key={g?.score ?? "none"} name="score" type="number" min={0} max={100} step={1} required defaultValue={g?.score} className="input w-20" aria-label={`Grade for ${s.fullName}`} />
                    </ApiForm>
                  </td>
                  <td>{g ? <span className="badge b-mute">{classify(g.score)}</span> : "-"}</td>
                  <td>
                    {g ? (
                      <ApiForm action={`/api/assessments/${a.id}/grades`} method="PATCH" submit={g.published ? "Withhold" : "Publish"} quiet keepValues className="flex items-center gap-2">
                        <input type="hidden" name="studentId" value={s.id} />
                        <input type="hidden" name="published" value={g.published ? "false" : "true"} />
                        <span className={`badge ${g.published ? "b-ok" : "b-warn"}`}>{g.published ? "Published" : "Withheld"}</span>
                      </ApiForm>
                    ) : <span className="text-slate-400">-</span>}
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
