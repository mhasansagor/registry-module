"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Posts a form to an API route (JSON, or multipart for file uploads), shows the server's
// error message inline, then refreshes the server-rendered page so data is always real.
export default function ApiForm({
  action,
  method = "POST",
  multipart = false,
  submit,
  className = "",
  quiet = false,
  keepValues = false,
  children,
}: {
  action: string;
  method?: "POST" | "PUT" | "PATCH";
  multipart?: boolean;
  submit: string;
  className?: string;
  quiet?: boolean;
  keepValues?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(action, {
        method,
        ...(multipart
          ? { body: fd }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(fd)) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else {
        if (!keepValues) form.reset();
        router.refresh();
      }
    } catch {
      setError("Network error - please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <button className={quiet ? "btn-quiet" : "btn"} disabled={busy}>
        {busy ? "Saving..." : submit}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
