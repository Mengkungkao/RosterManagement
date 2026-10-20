"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Enter the manager password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't sign in. Please try again.");
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5 text-fg">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <Icon name="roster" size={18} />
        </span>
        <span className="text-lg font-semibold tracking-tight">RosterManagement</span>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card">
        <h1 className="text-lg font-semibold text-fg">Manager sign in</h1>
        <p className="mt-1 text-sm text-muted">Manage events, staff and the roster.</p>
        <Field label="Password" className="mt-5">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" className="h-10" />
        </Field>
        {error && (
          <Alert tone="danger" className="mt-3" role="alert">
            {error}
          </Alert>
        )}
        <Button type="submit" variant="primary" loading={submitting} className="mt-5 h-10 w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Staff:{" "}
        <Link href="/" className="font-medium text-primary-text hover:underline">
          set your availability
        </Link>{" "}
        or{" "}
        <Link href="/today" className="font-medium text-primary-text hover:underline">
          see your shifts
        </Link>
      </p>
    </div>
  );
}
