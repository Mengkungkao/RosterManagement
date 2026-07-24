"use client";

import { useState } from "react";
import {
  DAYS,
  Day,
  DayStatus,
  WeekAvailability,
  emptyWeek,
} from "@/lib/availability";

type Message = { type: "success" | "error"; text: string } | null;
// "idle": no name entered yet / not yet checked.
// "checking": looking up whether this name has a password set.
// "new": no password set yet (new staff, or a pre-existing row from before this feature) — user picks one now.
// "existing": password-protected — user must enter it to unlock.
// "unlocked": password confirmed (or just chosen) — the availability form is editable.
type AccessState = "idle" | "checking" | "new" | "existing" | "unlocked";

const STATUS_OPTIONS: { value: DayStatus; label: string }[] = [
  { value: "unavailable", label: "Unavailable" },
  { value: "available_all_day", label: "All day" },
  { value: "custom", label: "Custom hours" },
];

export default function Home() {
  const [name, setName] = useState("");
  const [week, setWeek] = useState<WeekAvailability>(emptyWeek());
  const [access, setAccess] = useState<AccessState>("idle");
  const [password, setPassword] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  function resetAccess() {
    setAccess("idle");
    setPassword("");
    setAccessError(null);
    setWeek(emptyWeek());
    setMessage(null);
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
        setWeek(data.week);
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
      setWeek(data.week);
      setAccess("unlocked");
    } catch {
      setAccess("existing");
      setAccessError("Couldn't verify your password. Please try again.");
    }
  }

  function setDayStatus(day: Day, status: DayStatus) {
    setWeek((prev) => ({
      ...prev,
      [day]:
        status === "custom"
          ? {
              status,
              startTime: prev[day].startTime || "09:00",
              endTime: prev[day].endTime || "17:00",
            }
          : { status, startTime: "", endTime: "" },
    }));
  }

  function setDayTime(day: Day, field: "startTime" | "endTime", value: string) {
    setWeek((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Please enter your name first." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, week, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          // Someone else must have claimed this name with a different password
          // since we unlocked it — send them back to re-enter it.
          setAccess("existing");
          setAccessError(data.error || "Incorrect password.");
          setMessage(null);
          return;
        }
        throw new Error(data.error || "Failed to save");
      }
      setMessage({ type: "success", text: "Availability saved. Thank you!" });
    } catch {
      setMessage({
        type: "error",
        text: "Couldn't save your availability. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 pt-6 pb-10 dark:bg-black sm:pt-8 sm:pb-16">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Weekly Availability
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Let us know when you&apos;re free each day. Defaults to
          unavailable — tap a day to mark it available, or set specific
          hours (works overnight too, e.g. 22:00 to 06:00).
        </p>

        <div className="mt-6">
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
            onChange={(e) => {
              setName(e.target.value);
            }}
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
                ? "You'll use this next time to edit your availability."
                : "This name already has a password set."}
            </p>
            <form
              onSubmit={(e) => {
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
              onClick={resetAccess}
              className="mt-2 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Not you? Use a different name
            </button>
          </div>
        )}

        {access === "unlocked" && (
        <>
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Set your availability for the week.
          </p>
          <button
            type="button"
            onClick={resetAccess}
            className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Not you?
          </button>
        </div>

        <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
          {DAYS.map((day) => (
            <div key={day} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="w-24 shrink-0 font-medium text-zinc-800 dark:text-zinc-200">
                  {day}
                </span>
                <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDayStatus(day, opt.value)}
                      className={`px-3 py-1.5 text-sm transition-colors ${
                        week[day].status === opt.value
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
                      } ${opt.value !== "unavailable" ? "border-l border-zinc-300 dark:border-zinc-700" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {week[day].status === "custom" && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <label className="flex flex-1 basis-32 flex-col gap-1">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      From
                    </span>
                    <input
                      type="time"
                      value={week[day].startTime}
                      onChange={(e) => setDayTime(day, "startTime", e.target.value)}
                      className="w-max rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </label>
                  <label className="flex flex-1 basis-32 flex-col gap-1">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      To
                    </span>
                    <input
                      type="time"
                      value={week[day].endTime}
                      onChange={(e) => setDayTime(day, "endTime", e.target.value)}
                      className="w-max rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        {message && (
          <p
            className={`mt-4 text-sm ${
              message.type === "success"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "Saving…" : "Save availability"}
        </button>
        </>
        )}
      </div>
    </div>
  );
}
