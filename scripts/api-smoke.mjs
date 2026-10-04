// End-to-end API smoke test.
//
// It talks to the real HTTP API of a running instance (and the real database) and asserts the
// behaviour of every workflow: enrolment + auto ID, search/filter, fees and payments, student
// submissions (including late work), grading and per-student publish/withhold, and role checks.
//
// Usage:
//   1. start the app:  npm run dev        (or: npm run build && npm start)
//   2. run:            npm run test:api
//   Point it somewhere else with SMOKE_BASE, e.g. SMOKE_BASE=http://localhost:3000 npm run test:api
//
// The two student records it creates are deleted at the end (cascading their payments,
// submissions and grades, and their uploaded files), so the demo data is left untouched.
import { PrismaClient } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const UPLOAD_DIR = () => path.resolve(process.env.UPLOAD_DIR || "./uploads");
const db = new PrismaClient();

// A tiny cookie jar: the app keeps the selected role/student in cookies.
const jarMap = new Map();
const cookieHeader = () => [...jarMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(res) {
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(";")[0];
    const i = pair.indexOf("=");
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (v === "" || /expires=thu, 01 jan 1970/i.test(line)) jarMap.delete(k);
    else jarMap.set(k, v);
  }
}
async function api(route, { method = "GET", body, form } = {}) {
  const headers = {};
  if (jarMap.size) headers.cookie = cookieHeader();
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + route, { method, headers, body: payload, redirect: "manual" });
  absorb(res);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function html(route) {
  const headers = jarMap.size ? { cookie: cookieHeader() } : {};
  const res = await fetch(BASE + route, { headers, redirect: "manual" });
  absorb(res);
  return { status: res.status, text: await res.text() };
}
// Scope assertions to the first table body: the page HTML also embeds the RSC payload (which
// includes the RoleSwitcher's full student list), so whole-page greps give false positives.
const tbOf = (t) => (t.match(/<tbody>[\s\S]*?<\/tbody>/) || [""])[0];

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}
const pdfFile = (name, body) => new File([Buffer.from(body)], name, { type: "application/pdf" });
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
const createdStudentIds = [];

async function runSmoke() {
  const uniq = Date.now();
  const email = `smoke.${uniq}@example.com`;
  const cs = await db.programme.findUnique({ where: { code: "BSC-CS" } });
  const openAssessment = await db.assessment.findFirst({ where: { module: { programmeId: cs.id }, deadline: { gt: new Date() } } });

  console.log("\n[1] Staff pages render");
  check("GET / redirects", (await api("/")).status === 307);
  check("GET /staff 200", (await html("/staff")).status === 200);
  const list = await html("/staff/students");
  check("GET /staff/students 200", list.status === 200);
  check("seed student visible", list.text.includes("Amina Rahman"));

  console.log("\n[2] Enrol a student (validation + auto ID)");
  const bad = await api("/api/students", { method: "POST", body: { fullName: "X", email: "not-an-email", dob: "2010-01-01", programmeId: cs.id, academicYear: 2025, feeDueDate: "2026-01-01" } });
  check("invalid enrolment rejected 400", bad.status === 400, JSON.stringify(bad.data));
  const created = await api("/api/students", { method: "POST", body: { fullName: "Smoke Tester", email, dob: "2003-05-06", programmeId: cs.id, academicYear: 2025, status: "ENROLLED", feeDueDate: "2026-06-30" } });
  check("enrolment 201", created.status === 201, JSON.stringify(created.data));
  const sid = created.data.id;
  createdStudentIds.push(sid);
  check("auto Student ID format", /^SMS-2025-\d{4}$/.test(created.data.studentId), created.data.studentId);
  check("fee snapshotted from programme", created.data.feeAmount === cs.fee, String(created.data.feeAmount));
  const dup = await api("/api/students", { method: "POST", body: { fullName: "Smoke Dupe", email, dob: "2003-05-06", programmeId: cs.id, academicYear: 2025, feeDueDate: "2026-06-30" } });
  check("duplicate email 409", dup.status === 409, JSON.stringify(dup.data));

  console.log("\n[3] Search + filter");
  const search = await html(`/staff/students?q=${encodeURIComponent(created.data.studentId)}`);
  check("search by student ID finds record", tbOf(search.text).includes("Smoke Tester"));
  const filtered = await html("/staff/students?status=WITHDRAWN");
  check("status filter: withdrawn only", tbOf(filtered.text).includes("Grace Liu") && !tbOf(filtered.text).includes("Ben Carter"));
  const byProgramme = await html(`/staff/students?programme=${cs.id}`);
  check("programme filter excludes other programmes", tbOf(byProgramme.text).includes("Smoke Tester") && !tbOf(byProgramme.text).includes("Daniel Okoye"));

  console.log("\n[4] Fees: validation + live balance");
  const pay = await api(`/api/students/${sid}/payments`, { method: "POST", body: { amount: 100, paidAt: new Date(Date.now() - 86400000).toISOString(), reference: `SMOKE-${uniq}-A` } });
  check("valid payment 201", pay.status === 201, JSON.stringify(pay.data));
  const dupRef = await api(`/api/students/${sid}/payments`, { method: "POST", body: { amount: 50, paidAt: new Date().toISOString(), reference: `SMOKE-${uniq}-A` } });
  check("duplicate reference 409", dupRef.status === 409, JSON.stringify(dupRef.data));
  const tooMuch = await api(`/api/students/${sid}/payments`, { method: "POST", body: { amount: 999999, paidAt: new Date().toISOString(), reference: `SMOKE-${uniq}-B` } });
  check("overpayment rejected 409", tooMuch.status === 409, JSON.stringify(tooMuch.data));
  const future = await api(`/api/students/${sid}/payments`, { method: "POST", body: { amount: 10, paidAt: new Date(Date.now() + 3 * 86400000).toISOString(), reference: `SMOKE-${uniq}-C` } });
  check("future-dated payment rejected 400", future.status === 400, JSON.stringify(future.data));
  const detail = await html(`/staff/students/${sid}`);
  check("student detail renders", detail.status === 200 && detail.text.includes("Smoke Tester"));

  console.log("\n[5] Student view: submission rules");
  await api("/api/session", { method: "POST", body: { role: "student", studentRecordId: sid } });
  const sv = await html("/student");
  check("GET /student 200 for enrolled student", sv.status === 200);
  check("student sees own name", sv.text.includes("Smoke Tester"));
  const forbidden = await api("/api/students", { method: "POST", body: { fullName: "Hacker", email: `h${uniq}@example.com`, dob: "2003-01-01", programmeId: cs.id, academicYear: 2025, feeDueDate: "2026-01-01" } });
  check("student blocked from enrolling 403", forbidden.status === 403, JSON.stringify(forbidden.data));

  const fd1 = new FormData(); fd1.set("file", pdfFile("smoke.pdf", PDF));
  const sub1 = await api(`/api/assessments/${openAssessment.id}/submissions`, { method: "POST", form: fd1 });
  check("valid PDF submission 201", sub1.status === 201, JSON.stringify(sub1.data));
  const fdBad = new FormData(); fdBad.set("file", pdfFile("bad.pdf", "MZ\x90\x00 not a pdf"));
  const subBad = await api(`/api/assessments/${openAssessment.id}/submissions`, { method: "POST", form: fdBad });
  check("spoofed PDF rejected 400", subBad.status === 400, JSON.stringify(subBad.data));
  const fd2 = new FormData(); fd2.set("file", pdfFile("smoke-v2.pdf", "%PDF-1.4\nresubmit\n%%EOF\n"));
  const sub2 = await api(`/api/assessments/${openAssessment.id}/submissions`, { method: "POST", form: fd2 });
  check("resubmission before deadline replaces (200)", sub2.status === 200, JSON.stringify(sub2.data));
  const fileRes = await fetch(`${BASE}/api/submissions/${sub1.data.id}/file`, { headers: { cookie: cookieHeader() } });
  check("own file downloads 200", fileRes.status === 200);

  console.log("\n[6] Marksheet: grading + publish/withhold");
  await api("/api/session", { method: "POST", body: { role: "staff" } });
  const g = await api(`/api/assessments/${openAssessment.id}/grades`, { method: "PUT", body: { studentId: sid, score: 75 } });
  check("enter grade 200", g.status === 200, JSON.stringify(g.data));
  const badGrade = await api(`/api/assessments/${openAssessment.id}/grades`, { method: "PUT", body: { studentId: sid, score: 120 } });
  check("out-of-range grade rejected 400", badGrade.status === 400, JSON.stringify(badGrade.data));
  const pub = await api(`/api/assessments/${openAssessment.id}/grades`, { method: "PATCH", body: { studentId: sid, published: "true" } });
  check("publish 200", pub.status === 200, JSON.stringify(pub.data));

  await api("/api/session", { method: "POST", body: { role: "student", studentRecordId: sid } });
  const sv2 = await html("/student");
  check("published grade visible to student", sv2.text.includes("75") && sv2.text.includes("Distinction"));

  await api("/api/session", { method: "POST", body: { role: "staff" } });
  await api(`/api/assessments/${openAssessment.id}/grades`, { method: "PATCH", body: { studentId: sid, published: "false" } });
  await api("/api/session", { method: "POST", body: { role: "student", studentRecordId: sid } });
  const sv3 = await html("/student");
  check("withheld grade hidden from student", !sv3.text.includes("Distinction"));

  const withdrawn = await db.student.findFirst({ where: { status: "WITHDRAWN", programmeId: cs.id } });
  if (withdrawn) {
    await api("/api/session", { method: "POST", body: { role: "staff" } });
    const wg = await api(`/api/assessments/${openAssessment.id}/grades`, { method: "PUT", body: { studentId: withdrawn.id, score: 50 } });
    check("withdrawn student cannot be graded 409", wg.status === 409, JSON.stringify(wg.data));
  }

  console.log("\n[7] Late submissions (closed assessment)");
  const bm = await db.programme.findUnique({ where: { code: "BA-BM" } });
  const closed = await db.assessment.findFirst({ where: { module: { programmeId: bm.id }, deadline: { lt: new Date() } } });
  await api("/api/session", { method: "POST", body: { role: "staff" } });
  const late = await api("/api/students", { method: "POST", body: { fullName: "Late Larry", email: `late.${uniq}@example.com`, dob: "2003-01-01", programmeId: bm.id, academicYear: 2025, status: "ENROLLED", feeDueDate: "2026-06-30" } });
  createdStudentIds.push(late.data.id);
  await api("/api/session", { method: "POST", body: { role: "student", studentRecordId: late.data.id } });
  const fdl = new FormData(); fdl.set("file", pdfFile("late.pdf", PDF));
  const subLate = await api(`/api/assessments/${closed.id}/submissions`, { method: "POST", form: fdl });
  check("late submission accepted 201", subLate.status === 201, JSON.stringify(subLate.data));
  check("late submission flagged isLate=true", subLate.data.isLate === true, JSON.stringify(subLate.data));
  const fdl2 = new FormData(); fdl2.set("file", pdfFile("late2.pdf", PDF));
  const subLate2 = await api(`/api/assessments/${closed.id}/submissions`, { method: "POST", form: fdl2 });
  check("resubmission after deadline blocked 409", subLate2.status === 409, JSON.stringify(subLate2.data));
  await api("/api/session", { method: "POST", body: { role: "staff" } });
  const ms = await html(`/staff/assessments/${closed.id}`);
  check("marksheet shows Late badge", ms.text.includes("Late"));

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  return { pass, fail };
}

// Remove the records this run created, so the seeded demo data is left as it was.
async function cleanup() {
  if (!createdStudentIds.length) return;
  const subs = await db.submission.findMany({ where: { studentId: { in: createdStudentIds } } });
  for (const s of subs) await unlink(path.join(UPLOAD_DIR(), s.filePath)).catch(() => {});
  await db.student.deleteMany({ where: { id: { in: createdStudentIds } } });
}

try {
  const { fail: failed } = await runSmoke();
  await cleanup();
  console.log("Cleaned up the records created by this run.");
  process.exitCode = failed ? 1 : 0;
} catch (e) {
  console.error(e);
  await cleanup().catch(() => {});
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}



