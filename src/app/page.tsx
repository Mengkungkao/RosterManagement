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

const STATUS_OPTIONS: { value: DayStatus; label: string }[] = [
  { value: "unavailable", label: "Unavailable" },
  { value: "available_all_day", label: "All day" },
  { value: "custom", label: "Custom hours" },
];

export default function Home() {
  const [name, setName] = useState("");
  const [week, setWeek] = useState<WeekAvailability>(emptyWeek());
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  async function loadExisting() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoadingExisting(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/availability?name=${encodeURIComponent(trimmed)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setWeek(data.week);
      setHasLoaded(true);
      setMessage(
        data.found
          ? { type: "success", text: "Loaded your saved availability." }
          : {
              type: "success",
              text: "No previous entry found — starting fresh.",
            }
      );
    } catch {
      setMessage({ type: "error", text: "Couldn't load your availability." });
    } finally {
      setLoadingExisting(false);
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
        body: JSON.stringify({ name: trimmed, week }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:py-16">
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
            onChange={(e) => {
              setName(e.target.value);
              setHasLoaded(false);
            }}
            onBlur={loadExisting}
            placeholder="e.g. Jamie Smith"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {loadingExisting && (
            <p className="mt-1 text-xs text-zinc-400">Checking for a saved entry…</p>
          )}
          {hasLoaded && !loadingExisting && (
            <p className="mt-1 text-xs text-zinc-400">
              Editing existing availability for this name.
            </p>
          )}
        </div>

        <div className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
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
                <div className="mt-3 flex items-center gap-2 pl-0 sm:pl-24">
                  <input
                    type="time"
                    value={week[day].startTime}
                    onChange={(e) => setDayTime(day, "startTime", e.target.value)}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <span className="text-zinc-400">to</span>
                  <input
                    type="time"
                    value={week[day].endTime}
                    onChange={(e) => setDayTime(day, "endTime", e.target.value)}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
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
      </div>
    </div>
  );
}
