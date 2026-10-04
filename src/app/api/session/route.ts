import { cookies } from "next/headers";
import { z } from "zod";
import { handle, ok } from "@/lib/api";

const schema = z.object({ role: z.enum(["staff", "student"]), studentRecordId: z.string().optional() });

export const POST = handle(async (req) => {
  const { role, studentRecordId } = schema.parse(await req.json());
  const c = await cookies();
  c.set("role", role, { path: "/", sameSite: "lax" });
  if (role === "student" && studentRecordId) c.set("sid", studentRecordId, { path: "/", sameSite: "lax" });
  else c.delete("sid");
  return ok();
});
