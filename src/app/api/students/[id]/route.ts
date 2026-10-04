import { z } from "zod";
import { EnrolmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireStaff } from "@/lib/session";
import { feeSummary, money } from "@/lib/util";

// Student ID, fee amount and payment history are deliberately NOT editable here.
const schema = z.object({
  fullName: z.string().trim().min(2, "Enter the student's full name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  dob: z.coerce.date().refine((d) => d < new Date() && d.getFullYear() > 1900, "Date of birth must be in the past"),
  programmeId: z.string().min(1, "Choose a programme"),
  academicYear: z.coerce.number().int().min(2000).max(2100),
  status: z.nativeEnum(EnrolmentStatus),
  feeDueDate: z.coerce.date(),
});

export const PATCH = handle(async (req, { params }) => {
  await requireStaff();
  const { id } = await params;
  const input = schema.parse(await req.json());

  const updated = await db.$transaction(
    async (tx) => {
      const student = await tx.student.findUnique({
        where: { id },
        include: { payments: true, _count: { select: { submissions: true, grades: true } } },
      });
      if (!student) throw new HttpError(404, "Student not found.");
      // Completed is a final state: a graduated record should not silently reopen.
      if (student.status === "COMPLETED" && input.status !== "COMPLETED")
        throw new HttpError(409, "A completed enrolment cannot be changed.");

      let feeAmount = student.feeAmount;
      if (input.programmeId !== student.programmeId) {
        // Moving programme is an explicit action: the fee is re-snapshotted from the new programme.
        // It is blocked once assessed work exists, so submissions/grades never end up on a programme the student isn't on.
        if (student._count.submissions > 0 || student._count.grades > 0)
          throw new HttpError(409, "Programme cannot be changed once the student has submissions or results.");
        const programme = await tx.programme.findUnique({ where: { id: input.programmeId } });
        if (!programme) throw new HttpError(400, "Programme not found.");
        const { paid } = feeSummary(student);
        if (paid > programme.fee)
          throw new HttpError(409, `Payments already received (${money(paid)}) exceed the new programme fee of ${money(programme.fee)}.`);
        feeAmount = programme.fee;
      }

      return tx.student.update({
        where: { id: student.id },
        data: {
          fullName: input.fullName,
          email: input.email,
          dob: input.dob,
          programmeId: input.programmeId,
          academicYear: input.academicYear,
          status: input.status,
          feeDueDate: input.feeDueDate,
          feeAmount,
        },
      });
    },
    { isolationLevel: "Serializable" }, // a concurrent payment can't slip past the "paid <= new fee" check
  );
  return ok(updated);
});
