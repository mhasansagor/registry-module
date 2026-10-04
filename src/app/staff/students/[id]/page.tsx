import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { feeSummary, money, fmtDate, STATUS_LABEL, toInputDate } from "@/lib/util";
import ApiForm from "@/components/ApiForm";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const s = await db.student.findUnique({
    where: { id },
    include: { programme: true, payments: { orderBy: { paidAt: "desc" } }, _count: { select: { submissions: true, grades: true } } },
  });
  if (!s) notFound();
  const programmes = await db.programme.findMany({ orderBy: { name: "asc" } });
  const hasAssessedWork = s._count.submissions > 0 || s._count.grades > 0;
  // Dates from <input type="date"> are stored as UTC midnight, so read them back in UTC.
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const f = feeSummary(s);

  return (
    <div className="space-y-6">
      <div>
        <h1>{s.fullName}</h1>
        <p className="text-sm text-slate-600">{s.studentId} &middot; {s.programme.name} &middot; {s.academicYear}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel space-y-2 text-sm">
          <h2>Record</h2>
          <Row k="Email" v={s.email} />
          <Row k="Date of birth" v={fmtDate(s.dob)} />
          <Row k="Status" v={STATUS_LABEL[s.status]} />
        </section>

        <section className="panel space-y-2 text-sm">
          <h2>Fees</h2>
          <Row k="Fee assigned" v={money(s.feeAmount)} />
          <Row k="Paid" v={money(f.paid)} />
          <Row k="Outstanding" v={money(Math.max(f.outstanding, 0))} strong />
          <Row k="Due date" v={fmtDate(s.feeDueDate)} />
          {f.overdue && <p className="badge b-bad">Overdue by {f.daysOverdue} days</p>}
          {f.outstanding <= 0 && <p className="badge b-ok">Paid in full</p>}
        </section>

        <section className="panel">
          <h2 className="mb-3">Record a payment</h2>
          {f.outstanding > 0 ? (
            <ApiForm action={`/api/students/${s.id}/payments`} submit="Record payment" className="space-y-3">
              <div><label className="label">Amount (max {money(f.outstanding)})</label><input name="amount" type="number" step="0.01" min="0.01" required className="input" /></div>
              <div><label className="label">Date paid</label><input name="paidAt" type="date" defaultValue={toInputDate(new Date())} required className="input" /></div>
              <div><label className="label">Reference number</label><input name="reference" required className="input" /></div>
            </ApiForm>
          ) : (
            <p className="text-sm text-slate-600">Nothing left to collect for this student.</p>
          )}
        </section>
      </div>

      <details className="panel">
        <summary className="cursor-pointer text-sm font-medium text-brand">Edit student</summary>
        <p className="mt-3 text-xs text-slate-500">
          The student ID ({s.studentId}), fee and payment history cannot be edited. Changing programme re-assigns the fee from the new programme
          {hasAssessedWork ? " and is disabled because this student already has submissions or results." : "."}
        </p>
        <ApiForm action={`/api/students/${s.id}`} method="PATCH" submit="Save changes" keepValues className="mt-4 grid gap-3 sm:grid-cols-3">
          <div><label className="label">Full name</label><input name="fullName" required defaultValue={s.fullName} className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" required defaultValue={s.email} className="input" /></div>
          <div><label className="label">Date of birth</label><input name="dob" type="date" required defaultValue={isoDate(s.dob)} className="input" /></div>
          <div>
            <label className="label">Programme</label>
            {hasAssessedWork && <input type="hidden" name="programmeId" value={s.programmeId} />}
            <select name="programmeId" required defaultValue={s.programmeId} disabled={hasAssessedWork} className="input">
              {programmes.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.fee)})</option>)}
            </select>
          </div>
          <div><label className="label">Academic year</label><input name="academicYear" type="number" required defaultValue={s.academicYear} className="input" /></div>
          <div>
            <label className="label">Enrolment status</label>
            <select name="status" defaultValue={s.status} className="input">
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">Fee due date</label><input name="feeDueDate" type="date" required defaultValue={isoDate(s.feeDueDate)} className="input" /></div>
        </ApiForm>
      </details>

      <section className="panel p-0">
        <h2 className="p-5 pb-2">Payment history</h2>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {s.payments.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-500">No payments recorded yet.</td></tr>}
            {s.payments.map((p) => (
              <tr key={p.id}><td>{fmtDate(p.paidAt)}</td><td>{p.reference}</td><td className="text-right">{money(p.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{k}</span>
      <span className={strong ? "font-semibold" : ""}>{v}</span>
    </div>
  );
}
