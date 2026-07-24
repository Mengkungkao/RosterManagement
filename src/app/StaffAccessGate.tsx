"use client";

import { FormEvent, ReactNode, useState } from "react";
import { WeekAvailability, emptyWeek } from "@/lib/availability";

// "idle": no name entered yet / not yet checked.
// "checking": looking up whether this name has a password set, or verifying one.
// "new": no password set yet (new staff, or a pre-existing row from before this feature) — user picks one now.
// "existing": password-protected — user must enter it to unlock.
// "unlocked": password confirmed (or just chosen) — children render.
type AccessState = "idle" | "checking" | "new" | "existing" | "unlocked";

export interface StaffAccessProps {
  name: string;
  password: string;
  // Availability loaded for this name while unlocking, if any — callers that
  // don't care (e.g. Today's Events) can just ignore it.
  initialWeek: WeekAvailability;
  // Forgets the current session and returns to the name field.
  reset: () => void;
  // Re-locks with an error, e.g. after a privileged action the gate itself
  // didn't perform comes back 401/403 (password changed elsewhere since unlock).
  lock: (message?: string) => void;
}

export default function StaffAccessGate({
  children,
}: {
  children: (props: StaffAccessProps) => ReactNode;
}) {
  const [name, setName] = useState("");
  const [access, setAccess] = useState<AccessState>("idle");
  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [initialWeek, setInitialWeek] = useState<WeekAvailability>(emptyWeek());

  function reset() {
    setAccess("idle");
    setPassword("");
    setAccessError(null);
    setInitialWeek(emptyWeek());
  }

  function lock(message?: string) {
    setAccess("existing");
    setPassword("");
    setAccessError(message ?? null);
  }

  async function checkAccess() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAccess("checking");
    setAccessError(null);
    try {
      const res = await fetch(
        `/api/availability?name=${encodeURIComponent(trimmed)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      if (data.hasPassword) {
        setAccess("existing");
      } else {
        setInitialWeek(data.week);
        setAccess("new");
      }
    } catch {
      setAccess("idle");
      setAccessError("Couldn't check this name. Please try again.");
    }
  }

  function claimPassword() {
    if (password.trim().length === 0) {
      setAccessError("Choose a password first.");
      return;
    }
    setAccessError(null);
    setAccess("unlocked");
  }

  async function unlockExisting() {
    if (password.length === 0) {
      setAccessError("Enter your password.");
      return;
    }
    setAccess("checking");
    setAccessError(null);
    try {
      const res = await fetch("/api/availability/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAccess("existing");
        setAccessError(data.error || "Incorrect password.");
        return;
      }
      setInitialWeek(data.week);
      setAccess("unlocked");
    } catch {
      setAccess("existing");
      setAccessError("Couldn't verify your password. Please try again.");
    }
  }

  if (access === "unlocked") {
    return <>{children({ name: name.trim(), password, initialWeek, reset, lock })}</>;
  }

  return (
    <div className="mt-6">
      <div>
        <label
          htmlFor="staff-name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Your name
        </label>
        <input
          id="staff-name"
          type="text"
          value={name}
          disabled={access !== "idle"}
          onChange={(e) => setName(e.target.value)}
          onBlur={checkAccess}
          placeholder="e.g. Elon"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:disabled:bg-zinc-900/60 dark:disabled:text-zinc-500"
        />
        {access === "checking" && (
          <p className="mt-1 text-xs text-zinc-400">Checking…</p>
        )}
      </div>

      {(access === "new" || access === "existing") && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <label
            htmlFor="staff-password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {access === "new" ? "Choose a password" : "Enter your password"}
          </label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {access === "new"
              ? "You'll use this next time to log in."
              : "This name already has a password set."}
          </p>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (access === "new") claimPassword();
              else unlockExisting();
            }}
            className="mt-2 flex gap-2"
          >
            <input
              id="staff-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAccessError(null);
              }}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {access === "new" ? "Continue" : "Unlock"}
            </button>
          </form>
          {accessError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {accessError}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-2 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Not you? Use a different name
          </button>
        </div>
      )}
    </div>
  );
}
