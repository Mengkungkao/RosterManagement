"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventRecord } from "@/lib/events";
import { colorForEvent } from "@/lib/event-colors";
import {
  getMelbourneMinutesNow,
  layoutDayEvents,
  mod1440,
  toMinutes,
  type PositionedEvent,
} from "@/lib/roster-grid";
import StaffAccessGate, { StaffAccessProps } from "../StaffAccessGate";

const ROW_HEIGHT_PX = 64; // px per hour in the time grid
// Fixed lane above the event's actual start row for its name, location, and
// time range (each its own line — three lines total) — the card extends
// upward into this space rather than eating into the grid-aligned body
// below, so an activity at the event's own start time (very common — an
// untimed action defaults to it) still lines up with the real hour row
// instead of colliding with the header text.
const CARD_HEADER_HEIGHT = 46;
const CARD_BODY_BOTTOM_PADDING = 18; // room for the last activity's label to fully show
// Room above the first hour row for that header lane to expand into — without
// this, an event starting right at the top of the window would push its
// header above the grid entirely, overlapping the day's column heading.
const GRID_TOP_PADDING = CARD_HEADER_HEIGHT + 4;
// Room below the last hour row — has to be at least CARD_BODY_BOTTOM_PADDING,
// otherwise an event that ends exactly on the window's last hour mark would
// still get its own last activity clipped by the grid's overflow-hidden, one
// level up from the card's own padding.
const GRID_BOTTOM_PADDING = CARD_BODY_BOTTOM_PADDING + 4;

// Pixel offset (from the grid body's own top, padding included) for a given
// time — the one place the window→pixel conversion happens, so every piece
// of the grid (hour lines, labels, event cards, the now-line) agrees on it.
function timeToPx(
  minutes: number,
  windowStart: number,
  span: number,
  containerHeight: number
): number {
  return ((minutes - windowStart) / span) * containerHeight + GRID_TOP_PADDING;
}

interface DayData {
  date: string;
  label: string;
  events: EventRecord[];
}

function formatMinutes(totalMinutes: number): string {
  const t = mod1440(totalMinutes);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

// The window the shared grid covers: from the start of the earliest event's
// hour to the end of the latest one's, across *both* days — not a fixed 24h
// day — so today and tomorrow line up on the same hour rows without wasting
// space on hours nothing happens in.
function computeWindow(positioned: PositionedEvent[]): { start: number; end: number } | null {
  if (positioned.length === 0) return null;
  const start = Math.floor(Math.min(...positioned.map((p) => p.startMin)) / 60) * 60;
  const end = Math.max(
    start + 60,
    Math.ceil(Math.max(...positioned.map((p) => p.endMin)) / 60) * 60
  );
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
  // Sorted chronologically, untimed actions (no set time — "at the start of
  // the event") first, so the list always reads top-to-bottom in order.
  const sortedActions = [...pe.event.actions].sort((a, b) => {
    const aTime = a.time ? toMinutes(a.time) : pe.startMin;
    const bTime = b.time ? toMinutes(b.time) : pe.startMin;
    return aTime - bTime;
  });

  const pxPerMinute = containerHeight / span;
  // Where the event's own start row falls in the shared grid — the header
  // sits above this point, the body (and every activity in it) below it, so
  // an activity's row always matches the same hour gridline the event blocks
  // and other day's column already align to.
  const rowTop = timeToPx(pe.startMin, windowStart, span, containerHeight);
  const bodyHeight = (pe.endMin - pe.startMin) * pxPerMinute;

  return (
    <div
      className={`absolute flex flex-col overflow-hidden rounded text-[11px] leading-tight ${colorForEvent(pe.event.id)}`}
      style={{
        top: rowTop - CARD_HEADER_HEIGHT,
        minHeight: CARD_HEADER_HEIGHT + bodyHeight + CARD_BODY_BOTTOM_PADDING,
        left: `calc(${(pe.track / pe.trackCount) * 100}% + 2px)`,
        width: `calc(${100 / pe.trackCount}% - 4px)`,
      }}
    >
      {/* Header always renders first — a real flex-column child, not an
          absolutely-positioned overlay — so nothing can ever paint over it.
          Name, then location, then the time range, each its own line. */}
      <div className="shrink-0 px-1.5 pt-1" style={{ height: CARD_HEADER_HEIGHT }}>
        <div className="truncate font-semibold">{pe.event.name}</div>
        {pe.event.location && <div className="truncate opacity-80">{pe.event.location}</div>}
        <div className="tabular-nums opacity-80">
          {pe.event.startTime}–{pe.event.endTime}
        </div>
      </div>

      {sortedActions.length > 0 && (
        // A relative box (not a stacked list) so each action can sit at the
        // exact row matching its real time — using the same px-per-minute
        // rate as the shared hour gridlines, not a scale local to this card —
        // so it lines up with the grid, not just with the event's own span.
        <div className="relative min-h-0 flex-1 px-1.5">
          {sortedActions.map((action, i) => {
            const actionTime = action.time ? toMinutes(action.time) : pe.startMin;
            const top = Math.max(0, actionTime - pe.startMin) * pxPerMinute;
            return (
              <div
                key={i}
                className="absolute inset-x-1.5 flex gap-1 truncate"
                style={{ top }}
              >
                {action.time && <span className="font-semibold tabular-nums">{action.time}</span>}
                <span className="truncate">{action.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {pe.event.notes && (
        <div className="shrink-0 border-t border-black/10 px-1.5 py-1 whitespace-pre-wrap opacity-80 dark:border-white/10">
          {pe.event.notes}
        </div>
      )}
    </div>
  );
}

function NowLine({
  nowMinutes,
  windowStart,
  span,
  containerHeight,
}: {
  nowMinutes: number;
  windowStart: number;
  span: number;
  containerHeight: number;
}) {
  if (nowMinutes < windowStart || nowMinutes > windowStart + span) return null;
  const top = timeToPx(nowMinutes, windowStart, span, containerHeight);
  return (
    <div className="absolute inset-x-0 z-10 flex items-center" style={{ top }}>
      <span className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}

function HourGridlines({
  hourMarks,
  windowStart,
  span,
  containerHeight,
}: {
  hourMarks: number[];
  windowStart: number;
  span: number;
  containerHeight: number;
}) {
  return (
    <>
      {hourMarks.map((m) => (
        <div
          key={m}
          className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-900"
          style={{ top: timeToPx(m, windowStart, span, containerHeight) }}
        />
      ))}
    </>
  );
}

function DayColumn({
  positioned,
  hourMarks,
  windowStart,
  span,
  containerHeight,
  isToday,
  nowMinutes,
}: {
  positioned: PositionedEvent[];
  hourMarks: number[];
  windowStart: number;
  span: number;
  containerHeight: number;
  isToday: boolean;
  nowMinutes: number;
}) {
  return (
    <div
      className="relative border-l border-zinc-100 dark:border-zinc-900"
      style={{ height: containerHeight + GRID_TOP_PADDING + GRID_BOTTOM_PADDING }}
    >
      <HourGridlines
        hourMarks={hourMarks}
        windowStart={windowStart}
        span={span}
        containerHeight={containerHeight}
      />
      {positioned.map((pe) => (
        <EventCard
          key={pe.event.id}
          pe={pe}
          windowStart={windowStart}
          span={span}
          containerHeight={containerHeight}
        />
      ))}
      {isToday && (
        <NowLine
          nowMinutes={nowMinutes}
          windowStart={windowStart}
          span={span}
          containerHeight={containerHeight}
        />
      )}
    </div>
  );
}

function TodayEventsView({ name, password, reset, lock }: StaffAccessProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DayData[]>([]);
  const [nowMinutes, setNowMinutes] = useState(() => getMelbourneMinutesNow());

  useEffect(() => {
    const id = setInterval(() => setNowMinutes(getMelbourneMinutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);

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
        setDays(data.days);
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

  const positionedByDay = useMemo(
    () => days.map((day) => layoutDayEvents(day.events)),
    [days]
  );
  const windowRange = useMemo(
    () => computeWindow(positionedByDay.flat()),
    [positionedByDay]
  );

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Logged in as {name}
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

      {!loading && !error && !windowRange && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No events scheduled today or tomorrow.
        </p>
      )}

      {!loading && !error && windowRange && (
        (() => {
          const span = windowRange.end - windowRange.start;
          const containerHeight = (span / 60) * ROW_HEIGHT_PX;
          const hourMarks: number[] = [];
          for (let m = windowRange.start; m <= windowRange.end; m += 60) hourMarks.push(m);

          return (
            <div className="mt-4 overflow-hidden border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div
                className="grid"
                style={{ gridTemplateColumns: `44px repeat(${days.length}, 1fr)` }}
              >
                <div className="border-b border-zinc-100 px-1 py-2 text-[11px] font-medium text-zinc-400 dark:border-zinc-900 dark:text-zinc-500">
                  Time
                </div>
                {days.map((day) => (
                  <div
                    key={day.date}
                    className="border-b border-l border-zinc-100 px-2 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-900 dark:text-zinc-300"
                  >
                    {day.label}{" "}
                    <span className="font-normal text-zinc-400">
                      — {formatDayLabel(day.date)}
                    </span>
                  </div>
                ))}

                <div
                  className="relative"
                  style={{ height: containerHeight + GRID_TOP_PADDING + GRID_BOTTOM_PADDING }}
                >
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 px-1 text-[11px] text-zinc-400 dark:text-zinc-500"
                      style={{ top: timeToPx(m, windowRange.start, span, containerHeight) - 6 }}
                    >
                      {formatMinutes(m)}
                    </div>
                  ))}
                </div>

                {days.map((day, i) => (
                  <DayColumn
                    key={day.date}
                    positioned={positionedByDay[i]}
                    hourMarks={hourMarks}
                    windowStart={windowRange.start}
                    span={span}
                    containerHeight={containerHeight}
                    isToday={day.label === "Today"}
                    nowMinutes={nowMinutes}
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
          Log in with your name and password to see what&apos;s on today and
          tomorrow — event details and the run of show, no roster.
        </p>

        <StaffAccessGate>
          {(access) => <TodayEventsView {...access} />}
        </StaffAccessGate>
      </div>
    </div>
  );
}
