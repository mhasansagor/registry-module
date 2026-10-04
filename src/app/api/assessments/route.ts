import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireStaff } from "@/lib/session";

const schema = z.object({
  title: z.string().trim().min(2, "Enter a title"),
  moduleId: z.string().min(1, "Choose a module"),
  deadline: z.coerce.date(),
});

export const POST = handle(async (req) => {
  await requireStaff();
  const input = schema.parse(await req.json());
  if (!(await db.module.findUnique({ where: { id: input.moduleId } }))) throw new HttpError(400, "Module not found.");
  return ok(await db.assessment.create({ data: input }), 201);
});
