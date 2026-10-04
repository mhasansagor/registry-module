import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Ctx = { params: Promise<Record<string, string>> };

// Wraps a route handler so every failure becomes a consistent { error } JSON response.
export function handle(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") },
          { status: 400 },
        );
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          const target = String(e.meta?.target ?? "");
          const msg = target.includes("reference")
            ? "That payment reference has already been recorded."
            : target.includes("email")
              ? "A student with this email already exists."
              : target.includes("assessmentId")
                ? "A record for this student and assessment already exists."
                : "That value already exists.";
          return NextResponse.json({ error: msg }, { status: 409 });
        }
        if (e.code === "P2034") return NextResponse.json({ error: "Please try again - a concurrent change occurred." }, { status: 409 });
      }
      console.error(e);
      return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
    }
  };
}

export const ok = (data: unknown = { ok: true }, status = 200) => NextResponse.json(data, { status });
