import { PrismaClient, EnrolmentStatus } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const db = new PrismaClient();
const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day);
const ahead = (d: number) => new Date(Date.now() + d * day);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");

function fakePdf(rel: string) {
  const abs = path.join(UPLOAD_DIR, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
}

async function main() {
  await db.$transaction([
    db.grade.deleteMany(), db.submission.deleteMany(), db.assessment.deleteMany(), db.payment.deleteMany(),
    db.student.deleteMany(), db.studentSequence.deleteMany(), db.module.deleteMany(), db.programme.deleteMany(),
  ]);

  const cs = await db.programme.create({ data: { code: "BSC-CS", name: "BSc Computer Science", fee: 1_200_000 } });
  const bm = await db.programme.create({ data: { code: "BA-BM", name: "BA Business Management", fee: 950_000 } });
  const [csAlg, csWeb] = await Promise.all([
    db.module.create({ data: { code: "CS101", title: "Algorithms", programmeId: cs.id } }),
    db.module.create({ data: { code: "CS102", title: "Web Development", programmeId: cs.id } }),
  ]);
  const [bmMkt, bmFin] = await Promise.all([
    db.module.create({ data: { code: "BM101", title: "Marketing Principles", programmeId: bm.id } }),
    db.module.create({ data: { code: "BM102", title: "Financial Accounting", programmeId: bm.id } }),
  ]);

  // [name, email, programme, year, status, due-date offset (days, negative = past), paid (major units)]
  const seedStudents: [string, string, typeof cs, number, EnrolmentStatus, number, number][] = [
    ["Amina Rahman", "amina.rahman@example.com", cs, 2025, "ENROLLED", -20, 6000],   // part paid, OVERDUE
    ["Ben Carter", "ben.carter@example.com", cs, 2025, "ENROLLED", 30, 12000],        // paid in full
    ["Chitra Das", "chitra.das@example.com", cs, 2025, "ENROLLED", 15, 4000],         // part paid, not yet due
    ["Daniel Okoye", "daniel.okoye@example.com", bm, 2025, "ENROLLED", -45, 0],       // nothing paid, OVERDUE
    ["Elena Petrova", "elena.petrova@example.com", bm, 2025, "DEFERRED", 60, 2000],
    ["Farid Hossain", "farid.hossain@example.com", bm, 2025, "ENROLLED", 10, 9500],   // paid in full
    ["Grace Liu", "grace.liu@example.com", cs, 2026, "WITHDRAWN", -10, 1000],         // withdrawn, still owes
    ["Hassan Ali", "hassan.ali@example.com", bm, 2026, "COMPLETED", -100, 9500],
  ];

  const counters: Record<number, number> = {};
  const students: Record<string, { id: string; programmeId: string }> = {};
  let n = 0;
  for (const [name, email, prog, year, status, dueOffset, paid] of seedStudents) {
    counters[year] = (counters[year] ?? 0) + 1;
    const s = await db.student.create({
      data: {
        studentId: `SMS-${year}-${String(counters[year]).padStart(4, "0")}`,
        fullName: name, email, dob: new Date(1998 + (n % 6), n % 12, 5 + n), academicYear: year, status,
        programmeId: prog.id, feeAmount: prog.fee, feeDueDate: dueOffset < 0 ? ago(-dueOffset) : ahead(dueOffset),
      },
    });
    students[name] = s;
    if (paid > 0) {
      const half = Math.floor(paid / 2);
      const parts = paid === 12000 || paid === 9500 ? [half, paid - half] : [paid];
      for (const [i, amt] of parts.entries())
        await db.payment.create({ data: { studentId: s.id, amount: amt * 100, paidAt: ago(60 - i * 20), reference: `PAY-${n}-${i + 1}` } });
    }
    n++;
  }
  for (const [year, last] of Object.entries(counters)) await db.studentSequence.create({ data: { year: Number(year), last } });

  // Assessments: one closed (marked), one closed (mixed late), one open.
  const algo = await db.assessment.create({ data: { title: "Algorithms coursework", moduleId: csAlg.id, deadline: ago(14) } });
  const web = await db.assessment.create({ data: { title: "Portfolio website", moduleId: csWeb.id, deadline: ahead(10) } });
  const mkt = await db.assessment.create({ data: { title: "Marketing plan", moduleId: bmMkt.id, deadline: ago(7) } });

  async function submit(a: { id: string; deadline: Date }, who: string, offsetDays: number) {
    const rel = `${a.id}/${who.replace(/\s/g, "")}.pdf`;
    fakePdf(rel);
    const at = new Date(a.deadline.getTime() + offsetDays * day);
    await db.submission.create({
      data: { assessmentId: a.id, studentId: students[who].id, fileName: `${who.split(" ")[0]}-submission.pdf`, filePath: rel, submittedAt: at, isLate: at > a.deadline },
    });
  }
  await submit(algo, "Amina Rahman", -2);
  await submit(algo, "Ben Carter", -1);
  await submit(algo, "Chitra Das", 2); // late
  await submit(mkt, "Daniel Okoye", -3);
  await submit(mkt, "Farid Hossain", 1); // late
  await submit(web, "Ben Carter", -1);

  const grade = (a: { id: string }, who: string, score: number, published: boolean) =>
    db.grade.create({ data: { assessmentId: a.id, studentId: students[who].id, score, published, publishedAt: published ? new Date() : null } });
  await grade(algo, "Amina Rahman", 72, true);   // Distinction, published
  await grade(algo, "Ben Carter", 64, true);     // Merit, published
  await grade(algo, "Chitra Das", 38, false);    // Fail, withheld
  await grade(mkt, "Daniel Okoye", 55, false);   // Pass, withheld
  await grade(mkt, "Farid Hossain", 41, true);   // Pass, published

  console.log("Seeded: 2 programmes, 8 students, payments, 3 assessments, submissions, 5 grades.");
}

main().finally(() => db.$disconnect());
