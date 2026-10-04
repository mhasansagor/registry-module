// Pure business-rule tests (no database needed). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, feeSummary } from "../src/lib/util";
import { gradeSchema, paymentSchema, toMinorUnits } from "../src/lib/validation";
import { detectType } from "../src/lib/upload";

const day = 86_400_000;

test("classification boundaries", () => {
  const cases: [number, string][] = [[0, "Fail"], [39, "Fail"], [40, "Pass"], [59, "Pass"], [60, "Merit"], [69, "Merit"], [70, "Distinction"], [100, "Distinction"]];
  for (const [score, want] of cases) assert.equal(classify(score), want, `score ${score}`);
});

test("grade validation accepts 0-100 integers", () => {
  for (const score of [0, 40, 60, 70, 100, "55"]) assert.ok(gradeSchema.safeParse({ studentId: "s", score }).success, `score ${score}`);
});

test("grade validation rejects out-of-range, fractional and empty values", () => {
  for (const score of [-1, 100.1, 101, 39.5, "", null, undefined, "abc"])
    assert.equal(gradeSchema.safeParse({ studentId: "s", score }).success, false, `score ${String(score)}`);
});

test("payment: future dates rejected, now/past accepted (small clock skew tolerated)", () => {
  const base = { amount: 10, reference: "REF-1" };
  assert.ok(paymentSchema.safeParse({ ...base, paidAt: new Date() }).success); // exact "now" must never be rejected
  assert.ok(paymentSchema.safeParse({ ...base, paidAt: new Date(Date.now() + 10_000) }).success); // client clock a few seconds ahead
  assert.equal(paymentSchema.safeParse({ ...base, paidAt: new Date(Date.now() + 120_000) }).success, false);
  assert.equal(paymentSchema.safeParse({ ...base, paidAt: new Date(Date.now() + 12 * 3_600_000) }).success, false); // not a 24h grace window
  assert.ok(paymentSchema.safeParse({ ...base, paidAt: new Date(Date.now() - 1000) }).success);
  assert.ok(paymentSchema.safeParse({ ...base, paidAt: new Date(Date.now() - 30 * day) }).success);
});

test("payment: amount must be positive with at most 2 decimals", () => {
  const ok = { paidAt: new Date(Date.now() - 1000), reference: "REF-1" };
  for (const amount of [0, -5, 0.001, 10.005, "", "abc", Infinity]) assert.equal(paymentSchema.safeParse({ ...ok, amount }).success, false, `amount ${String(amount)}`);
  for (const amount of [0.01, 19.99, 1200, "125.50"]) assert.ok(paymentSchema.safeParse({ ...ok, amount }).success, `amount ${amount}`);
  assert.equal(toMinorUnits(19.99), 1999);
  assert.equal(toMinorUnits(0.29), 29);
});

test("payment: reference is required and trimmed", () => {
  const r = paymentSchema.safeParse({ amount: 1, paidAt: new Date(Date.now() - 1000), reference: "  AB  " });
  assert.equal(r.success, false);
});

test("fee summary: partial, full, overdue, not-yet-due", () => {
  const due = (offset: number) => new Date(Date.now() + offset * day);
  const partialOverdue = feeSummary({ feeAmount: 1000, feeDueDate: due(-5), payments: [{ amount: 400 }] });
  assert.deepEqual([partialOverdue.paid, partialOverdue.outstanding, partialOverdue.overdue], [400, 600, true]);
  const paidInFullPastDue = feeSummary({ feeAmount: 1000, feeDueDate: due(-5), payments: [{ amount: 600 }, { amount: 400 }] });
  assert.deepEqual([paidInFullPastDue.outstanding, paidInFullPastDue.overdue], [0, false]);
  assert.equal(feeSummary({ feeAmount: 1000, feeDueDate: due(5), payments: [] }).overdue, false);
  assert.equal(feeSummary({ feeAmount: 1000, feeDueDate: due(-1), payments: [] }).overdue, true);
});

test("upload: genuine PDF/DOCX accepted, spoofed or unsupported rejected", () => {
  const pdf = Buffer.from("%PDF-1.4\n...");
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....word/document.xml....")]);
  const plainZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....other.txt....")]);
  const exe = Buffer.from("MZ\x90\x00 this is not a pdf");
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  assert.equal(detectType("essay.pdf", "application/pdf", pdf), "pdf");
  assert.equal(detectType("essay.PDF", "", pdf), "pdf");
  assert.equal(detectType("essay.docx", DOCX_MIME, docx), "docx");
  assert.equal(detectType("virus.pdf", "application/pdf", exe), null); // renamed executable
  assert.equal(detectType("virus.exe", "application/x-msdownload", exe), null);
  assert.equal(detectType("archive.docx", DOCX_MIME, plainZip), null); // a ZIP that is not a Word document
  assert.equal(detectType("essay.pdf", "image/png", pdf), null); // conflicting MIME type
  assert.equal(detectType("essay.txt", "text/plain", Buffer.from("hello")), null);
  assert.equal(detectType("noextension", "", pdf), null);
});
