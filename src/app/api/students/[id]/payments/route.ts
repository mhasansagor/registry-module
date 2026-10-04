import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireStaff } from "@/lib/session";
import { feeSummary, money } from "@/lib/util";
import { paymentSchema, toMinorUnits } from "@/lib/validation";

export const POST = handle(async (req, { params }) => {
  await requireStaff();
  const { id } = await params;
  const input = paymentSchema.parse(await req.json());
  const amount = toMinorUnits(input.amount);

  const payment = await db.$transaction(
    async (tx) => {
      const student = await tx.student.findUnique({ where: { id }, include: { payments: true } });
      if (!student) throw new HttpError(404, "Student not found.");
      // Friendly application-level check; the unique index on Payment.reference is the real guarantee.
      if (await tx.payment.findUnique({ where: { reference: input.reference } }))
        throw new HttpError(409, "That payment reference has already been recorded.");
      const { outstanding } = feeSummary(student);
      if (outstanding <= 0) throw new HttpError(409, "This student has no outstanding balance.");
      if (amount > outstanding)
        throw new HttpError(409, `Payment exceeds the outstanding balance of ${money(outstanding)}.`);
      return tx.payment.create({ data: { studentId: student.id, amount, paidAt: input.paidAt, reference: input.reference } });
    },
    { isolationLevel: "Serializable" }, // two clerks recording at once cannot overpay
  );
  return ok(payment, 201);
});
