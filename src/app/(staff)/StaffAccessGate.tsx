"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { WeekAvailability, emptyWeek } from "@/lib/availability";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";

// "idle": no name entered yet / not yet checked.
// "checking": looking up whether this name has a password set, or verifying one.
// "new": no password set yet (new staff, or a pre-existing row from before this feature) — user picks one now.
// "existing": password-protected — user must enter it to unlock.
// "unlocked": password confirmed (or just chosen) — children render.
type AccessState = "idle" | "checking" | "new" | "existing" | "unlocked";

const NAME_KEY = "roster-staff-name";

// A staff member's own request, as the server shows it to them.
export interface OwnRequest {
  id: string;
  kind: "time_off" | "change";
  from: string;
  to: string;
  eventName: string;
  note: string;
  status: "pending" | "approved" | "declined" | "resolved";
}

export interface StaffAccessProps {
  name: string;
  password: string;
  initialRequests: OwnRequest[];
  // Availability loaded for this name while unlocking, if any — callers that
  // don't care (e.g. Today's Events) can just ignore it.
  initialWeek: WeekAvailability;
  // Whether they've saved their availability before (false: "not set yet").
  initialSet: boolean;
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
  const [initialRequests, setInitialRequests] = useState<OwnRequest[]>([]);
  const [initialSet, setInitialSet] = useState(true);

  // Remembers the last name used on this device, so staff only type it once.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setName(saved);
    } catch {
      // storage blocked (private mode) — just start empty
    }
  }, []);

  function reset() {
    setAccess("idle");
    setPassword("");
    setAccessError(null);
    setInitialWeek(emptyWeek());
    setInitialRequests([]);
  }

  function lock(message?: string) {
    setAccess("existing");
    setPassword("");
    setAccessError(message ?? null);
  }

  async function checkAccess() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // not remembered — fine
    }
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
        setInitialSet(Boolean(data.set));
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
      setInitialSet(data.set !== false);
      setInitialRequests(data.requests ?? []);
      setAccess("unlocked");
    } catch {
      setAccess("existing");
      setAccessError("Couldn't verify your password. Please try again.");
    }
  }

  if (access === "unlocked") {
    return <>{children({ name: name.trim(), password, initialWeek, initialSet, initialRequests, reset, lock })}</>;
  }

  const asking = access === "new" || access === "existing";
  return (
    <div className="mt-5 space-y-4">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          checkAccess();
        }}
      >
        <label htmlFor="staff-name" className="mb-1 block text-[13px] font-medium text-fg-2">
          Your name
        </label>
        <div className="flex gap-2">
          <input
            id="staff-name"
            type="text"
            autoComplete="name"
            value={name}
            disabled={access !== "idle"}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last name"
            className={`${controlClass} h-10`}
          />
          {access === "idle" && (
            <Button type="submit" variant="primary" disabled={!name.trim()} className="h-10">
              Continue
            </Button>
          )}
          {asking && (
            <Button variant="ghost" onClick={reset} className="h-10">
              Change
            </Button>
          )}
        </div>
        {access === "checking" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted" role="status">
            <Spinner size={12} /> Checking…
          </p>
        )}
        {access === "idle" && accessError && (
          <p className="mt-1.5 text-xs text-danger" role="alert">
            {accessError}
          </p>
        )}
      </form>

      {asking && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (access === "new") claimPassword();
            else unlockExisting();
          }}
          className="rounded-lg border border-line bg-surface-2 p-4"
        >
          <label htmlFor="staff-password" className="block text-[13px] font-medium text-fg-2">
            {access === "new" ? "Choose a password" : "Your password"}
          </label>
          <p className="mt-0.5 text-xs text-muted">
            {access === "new" ? "You'll use it each time you open this page." : "Ask your manager to reset it if you've forgotten it."}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="staff-password"
              type="password"
              autoFocus
              autoComplete={access === "new" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAccessError(null);
              }}
              aria-invalid={accessError ? true : undefined}
              className={`${controlClass} h-10`}
            />
            <Button type="submit" variant="primary" className="h-10">
              {access === "new" ? "Continue" : "Unlock"}
            </Button>
          </div>
          {accessError && (
            <p className="mt-1.5 text-xs text-danger" role="alert">
              {accessError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
