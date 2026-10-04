import type { EnrolmentStatus } from "@prisma/client";

export const STATUS_LABEL: Record<EnrolmentStatus, string> = {
  ENROLLED: "Enrolled",
  DEFERRED: "Deferred",
  WITHDRAWN: "Withdrawn",
  COMPLETED: "Completed",
};

export const money = (minor: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: process.env.NEXT_PUBLIC_CURRENCY || "USD",
  }).format(minor / 100);

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const fmtDateTime = (d: Date) =>
  d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const totalPaid = (payments: { amount: number }[]) => payments.reduce((s, p) => s + p.amount, 0);

export function feeSummary(s: { feeAmount: number; feeDueDate: Date; payments: { amount: number }[] }) {
  const paid = totalPaid(s.payments);
  const outstanding = s.feeAmount - paid;
  const overdue = outstanding > 0 && s.feeDueDate.getTime() < Date.now();
  const daysOverdue = overdue ? Math.floor((Date.now() - s.feeDueDate.getTime()) / 86_400_000) : 0;
  return { paid, outstanding, overdue, daysOverdue };
}

// Pass >= 40, Merit >= 60, Distinction >= 70
export function classify(score: number) {
  if (score >= 70) return "Distinction";
  if (score >= 60) return "Merit";
  if (score >= 40) return "Pass";
  return "Fail";
}

export const toInputDateTime = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const toInputDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
