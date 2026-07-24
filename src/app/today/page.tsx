"use client";

import { useEffect, useState } from "react";
import type { Eventaction } from "@/lib/events";
import StaffAccessGate, { StaffAccessProps } from "../StaffAccessGate";

interface TodayEvent {
  name: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  actions: Eventaction[];
}

function TodayEventsView({ name, password, reset, lock }: StaffAccessProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [events, setEvents] = useState<TodayEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/events/today", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            lock(data.error || "Incorrect password.");
            return;
          }
          throw new Error(data.error || "Failed to load today's events");
        }
        if (cancelled) return;
        setDate(data.date);
        setEvents(data.events);
      } catch {
        if (!cancelled) {
          setError("Couldn't load today's events. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {date ? `Today — ${date}` : "Today's events"}
        </p>
        <button
          type="button"
          onClick={reset}
          className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Not you?
        </button>
      </div>

      {loading && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      )}

      {!loading && error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No events scheduled today.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="mt-4 space-y-4">
          {events.map((event, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {event.name}
                </h2>
                <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                  {event.startTime}–{event.endTime}
                </span>
              </div>
              {event.location && (
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {event.location}
                </p>
              )}

              {event.actions.length > 0 && (
                <ol className="mt-3 space-y-1.5 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                  {event.actions.map((action, j) => (
                    <li key={j} className="text-sm text-zinc-700 dark:text-zinc-300">
                      {action.time && (
                        <span className="mr-2 font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                          {action.time}
                        </span>
                      )}
                      {action.label}
                    </li>
                  ))}
                </ol>
              )}

              {event.notes && (
                <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  {event.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function TodayPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 pt-6 pb-10 dark:bg-black sm:pt-8 sm:pb-16">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Today&apos;s Events
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Log in with your name and password to see what&apos;s on today —
          event details and the run of show, no roster.
        </p>

        <StaffAccessGate>
          {(access) => <TodayEventsView {...access} />}
        </StaffAccessGate>
      </div>
    </div>
  );
}
