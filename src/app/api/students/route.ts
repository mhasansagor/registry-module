import { z } from "zod";
import { EnrolmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireStaff } from "@/lib/session";

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter the student's full name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  dob: z.coerce.date().refine((d) => d < new Date() && d.getFullYear() > 1900, "Date of birth must be in the past"),
  programmeId: z.string().min(1, "Choose a programme"),
  academicYear: z.coerce.number().int().min(2000).max(2100),
  status: z.nativeEnum(EnrolmentStatus).default("ENROLLED"),
  feeDueDate: z.coerce.date(),
});

export const POST = handle(async (req) => {
  await requireStaff();
  const input = schema.parse(await req.json());

  const student = await db.$transaction(async (tx) => {
    const programme = await tx.programme.findUnique({ where: { id: input.programmeId } });
    if (!programme) throw new HttpError(400, "Programme not found.");

    // Atomic per-year counter: concurrent enrolments can never receive the same ID.
    const seq = await tx.studentSequence.upsert({
      where: { year: input.academicYear },
      create: { year: input.academicYear, last: 1 },
      update: { last: { increment: 1 } },
    });
    const studentId = `SMS-${input.academicYear}-${String(seq.last).padStart(4, "0")}`;

    return tx.student.create({
      data: {
        studentId,
        fullName: input.fullName,
        email: input.email,
        dob: input.dob,
        academicYear: input.academicYear,
        status: input.status,
        programmeId: programme.id,
        feeAmount: programme.fee, // snapshot of the programme fee
        feeDueDate: input.feeDueDate,
      },
    });
  });
  return ok(student, 201);
});
