"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventRecord } from "@/lib/events";
import { colorForEvent } from "@/lib/event-colors";
import {
  layoutDayEvents,
  mod1440,
  toMinutes,
  type PositionedEvent,
} from "@/lib/roster-grid";
import StaffAccessGate, { StaffAccessProps } from "../StaffAccessGate";

const ROW_HEIGHT_PX = 64; // px per hour in the time grid
const MIN_CARD_HEIGHT = 32; // px floor so a card is never literally unreadable

function formatMinutes(totalMinutes: number): string {
  const t = mod1440(totalMinutes);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// The window the grid covers: from the start of the earliest event's hour to
// the end of the latest event's hour — not a fixed 24h day — so the grid is
// only ever as tall as today's actual events need.
function computeWindow(positioned: PositionedEvent[]): { start: number; end: number } | null {
  if (positioned.length === 0) return null;
  const rawStart = Math.min(...positioned.map((p) => p.startMin));
  const rawEnd = Math.max(...positioned.map((p) => p.endMin));
  const start = Math.floor(rawStart / 60) * 60;
  const end = Math.max(start + 60, Math.ceil(rawEnd / 60) * 60);
  return { start, end };
}

function EventCard({
  pe,
  windowStart,
  span,
  containerHeight,
}: {
  pe: PositionedEvent;
  windowStart: number;
  span: number;
  containerHeight: number;
}) {
  const sortedActions = [...pe.event.actions].sort((a, b) => {
    const aTime = a.time ? toMinutes(a.time) : pe.startMin;
    const bTime = b.time ? toMinutes(b.time) : pe.startMin;
    return aTime - bTime;
  });

  return (
    <div
      className={`absolute flex flex-col overflow-hidden rounded-lg text-[11px] leading-tight ${colorForEvent(pe.event.id)}`}
      style={{
        top: ((pe.startMin - windowStart) / span) * containerHeight,
        minHeight: Math.max(
          MIN_CARD_HEIGHT,
          ((pe.endMin - pe.startMin) / span) * containerHeight
        ),
        left: `calc(${(pe.track / pe.trackCount) * 100}% + 2px)`,
        width: `calc(${100 / pe.trackCount}% - 4px)`,
      }}
    >
      <div className="shrink-0 px-2 pt-1.5">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold">{pe.event.name}</span>
          <span className="tabular-nums opacity-80">
            {pe.event.startTime}–{pe.event.endTime}
          </span>
        </div>
        {pe.event.location && <div className="opacity-80">{pe.event.location}</div>}
      </div>

      {sortedActions.length > 0 && (
        <div className="min-h-0 flex-1 space-y-0.5 px-2 pt-1 pb-1 opacity-90">
          {sortedActions.map((action, i) => (
            <div key={i} className="flex gap-1">
              {action.time && <span className="font-semibold tabular-nums">{action.time}</span>}
              <span>{action.label}</span>
            </div>
          ))}
        </div>
      )}

      {pe.event.notes && (
        <div className="shrink-0 border-t border-black/10 px-2 py-1 whitespace-pre-wrap opacity-80 dark:border-white/10">
          {pe.event.notes}
        </div>
      )}
    </div>
  );
}

function TodayEventsView({ name, password, reset, lock }: StaffAccessProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);

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

  const positioned = useMemo(() => layoutDayEvents(events), [events]);
  const windowRange = useMemo(() => computeWindow(positioned), [positioned]);

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

      {!loading && !error && windowRange && (
        (() => {
          const span = windowRange.end - windowRange.start;
          const hours = span / 60;
          const containerHeight = hours * ROW_HEIGHT_PX;
          const hourMarks: number[] = [];
          for (let m = windowRange.start; m <= windowRange.end; m += 60) hourMarks.push(m);

          return (
            <div className="mt-4 flex overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div
                className="relative w-14 shrink-0 border-r border-zinc-100 dark:border-zinc-900"
                style={{ height: containerHeight }}
              >
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 px-2 text-[11px] text-zinc-400 dark:text-zinc-500"
                    style={{ top: ((m - windowRange.start) / span) * containerHeight - 6 }}
                  >
                    {formatMinutes(m)}
                  </div>
                ))}
              </div>
              <div className="relative flex-1" style={{ height: containerHeight }}>
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-900"
                    style={{ top: ((m - windowRange.start) / span) * containerHeight }}
                  />
                ))}
                {positioned.map((pe) => (
                  <EventCard
                    key={pe.event.id}
                    pe={pe}
                    windowStart={windowRange.start}
                    span={span}
                    containerHeight={containerHeight}
                  />
                ))}
              </div>
            </div>
          );
        })()
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
