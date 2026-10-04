import { z } from "zod";

// Grade: a whole number 0-100. Empty / null must be rejected, not silently coerced to 0.
export const gradeSchema = z.object({
  studentId: z.string().min(1),
  score: z.preprocess(
    (v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    z.coerce
      .number({ invalid_type_error: "Enter a whole-number grade", required_error: "Enter a whole-number grade" })
      .int("Grade must be a whole number")
      .min(0, "Grade must be 0-100")
      .max(100, "Grade must be 0-100"),
  ),
});

// Payment amount is entered in major units (e.g. 125.50) and must be a whole number of minor units.
// A small future tolerance absorbs client/server clock skew: a genuine "today" payment must never be
// rejected as "in the future" just because the clock that sent it runs a few hundred ms ahead.
export const CLOCK_SKEW_MS = 30_000;

export const paymentSchema = z.object({
  amount: z.coerce
    .number()
    .finite("Enter a valid amount")
    .positive("Amount must be greater than zero")
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Amount can have at most 2 decimal places"),
  paidAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + CLOCK_SKEW_MS, "Payment date cannot be in the future"),
  reference: z.string().trim().min(3, "Enter the payment reference"),
});

export const toMinorUnits = (major: number) => Math.round(major * 100);
