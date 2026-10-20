"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/lib/events";
import { colorForEvent } from "@/lib/event-colors";
import { formatHours, formatWeekdayDate, mod1440, toMinutes } from "@/lib/dates";
import { getMelbourneMinutesNow, layoutDayEvents, type PositionedEvent } from "@/lib/roster-grid";
import StaffAccessGate, { type OwnRequest, StaffAccessProps } from "../StaffAccessGate";
import { StatusChip, sendRequest } from "../StaffRequests";

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

const MIN_TODAY_COL_WIDTH = 140;
const MAX_TODAY_COL_WIDTH = 520;

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

interface ShiftInfo {
  eventId: string;
  eventName: string;
  location: string;
  time: string;
  taskName: string;
  taskNotes: string;
  eventTime: string;
  eventNotes: string;
  actions: { label: string; time: string }[];
}

interface WorkDay {
  date: string;
  hours: number;
  breaks: string[];
  shifts: ShiftInfo[];
}

function ChangeRequest({
  shift,
  name,
  password,
  requests,
  onChange,
  lock,
}: {
  shift: ShiftInfo;
  name: string;
  password: string;
  requests: OwnRequest[];
  onChange: (r: OwnRequest[]) => void;
  lock: (message?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = requests.filter((r) => r.kind === "change" && r.eventName === shift.eventName);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    const result = await sendRequest("POST", { name, password, kind: "change", eventId: shift.eventId, note });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 401) lock(result.error);
      else setError(result.error);
      return;
    }
    onChange(result.requests);
    setOpen(false);
    setNote("");
  }

  return (
    <div className="mt-1">
      {existing.map((r) => (
        <div key={r.id} className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <StatusChip status={r.status} /> You asked: “{r.note}”
        </div>
      ))}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Can&apos;t make it, or something&apos;s wrong? Ask for a change
        </button>
      ) : (
        <form onSubmit={submit} className="mt-2 space-y-2">
          <textarea
            autoFocus
            rows={2}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. I have an exam until 6pm — could I start at 18:30?"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-500 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !note.trim()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {busy ? "Sending…" : "Send to my manager"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-zinc-500 underline">
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}
    </div>
  );
}

function MyShifts({
  workDays,
  today,
  name,
  password,
  requests,
  onRequests,
  lock,
}: {
  workDays: WorkDay[];
  today: string | undefined;
  name: string;
  password: string;
  requests: OwnRequest[];
  onRequests: (r: OwnRequest[]) => void;
  lock: (message?: string) => void;
}) {
  return (
    <section className="mt-4">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Your shifts <span className="font-normal text-zinc-400">· next 2 weeks</span>
      </h2>
      {workDays.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          You&apos;re not rostered on in the next two weeks.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {workDays.map((day) => (
            <li
              key={day.date}
              className={`px-3 py-3 ${day.date === today ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {day.date === today ? "Today" : formatWeekdayDate(day.date)}
                </span>
                <span className="shrink-0 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
                  {formatHours(day.hours)}
                  {day.breaks.length > 0 && ` · break ${day.breaks.join(", ")}`}
                </span>
              </div>
              {day.shifts.map((shift) => (
                <div key={`${shift.eventId}-${shift.taskName}-${shift.time}`} className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <div>
                    <span className="font-medium tabular-nums">{shift.time}</span>{" "}
                    {shift.taskName ? (
                      <>
                        <span className="font-medium">{shift.taskName}</span> · {shift.eventName}
                      </>
                    ) : (
                      shift.eventName
                    )}
                    {shift.location && <span className="text-zinc-500 dark:text-zinc-400"> · {shift.location}</span>}
                  </div>
                  {shift.taskNotes && <p className="text-xs text-zinc-600 dark:text-zinc-400">Your task: {shift.taskNotes}</p>}
                  {(shift.eventNotes || shift.actions.length > 0) && (
                    <details className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <summary className="cursor-pointer">Event {shift.eventTime}, notes and run of show</summary>
                      {shift.eventNotes && <p className="mt-1 whitespace-pre-wrap">{shift.eventNotes}</p>}
                      {shift.actions.length > 0 && (
                        <ul className="mt-1">
                          {shift.actions.map((a, i) => (
                            <li key={i}>
                              <span className="tabular-nums">{a.time || shift.eventTime.slice(0, 5)}</span> {a.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  )}
                  <ChangeRequest shift={shift} name={name} password={password} requests={requests} onChange={onRequests} lock={lock} />
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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

function ResizeHandle({
  width,
  onResize,
  onReset,
}: {
  width: number;
  onResize: (newWidth: number) => void;
  onReset: () => void;
}) {
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    // Measure the column's actual rendered width rather than trusting the
    // `width` prop, since an auto-sized column is laid out as a fluid `fr`
    // track — its real pixel width depends on the container, not the prop.
    const renderedWidth = e.currentTarget.parentElement?.getBoundingClientRect().width;
    dragState.current = { startX: e.clientX, startWidth: renderedWidth ?? width };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const delta = e.clientX - dragState.current.startX;
    const next = Math.max(
      MIN_TODAY_COL_WIDTH,
      Math.min(MAX_TODAY_COL_WIDTH, dragState.current.startWidth + delta)
    );
    onResize(next);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragState.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={onReset}
      title="Drag to resize · double-click to auto-fit"
      className="absolute top-0 right-0 z-40 h-full w-2.5 cursor-col-resize touch-none select-none hover:bg-zinc-300 active:bg-zinc-400 dark:hover:bg-zinc-700"
    />
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
  const [requests, setRequests] = useState<OwnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DayData[]>([]);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [nowMinutes, setNowMinutes] = useState(() => getMelbourneMinutesNow());
  // null = auto (shares the row equally with Tomorrow via `1fr`); a manual
  // drag pins a fixed pixel width until reset (double-click the handle).
  const [todayColWidth, setTodayColWidth] = useState<number | null>(null);

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
          throw new Error(data.error || "Couldn't load your shifts");
        }
        if (cancelled) return;
        setDays(data.days);
        setWorkDays(data.workDays);
        setRequests(data.requests ?? []);
      } catch {
        if (!cancelled) {
          setError("Couldn't load your shifts. Please try again.");
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

      {!loading && !error && (
        <>
          <MyShifts
            workDays={workDays}
            today={days[0]?.date}
            name={name}
            password={password}
            requests={requests}
            onRequests={setRequests}
            lock={lock}
          />
          <h2 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Today &amp; tomorrow
          </h2>
        </>
      )}

      {!loading && !error && !windowRange && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
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
            <div className="mt-2 overflow-hidden border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `44px ${days
                    .map((day) =>
                      day.label === "Today" && todayColWidth !== null
                        ? `${todayColWidth}px`
                        : "1fr"
                    )
                    .join(" ")}`,
                }}
              >
                <div className="border-b border-zinc-100 px-1 py-2 text-[11px] font-medium text-zinc-400 dark:border-zinc-900 dark:text-zinc-500">
                  Time
                </div>
                {days.map((day) => (
                  <div
                    key={day.date}
                    className="relative border-b border-l border-zinc-100 px-2 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-900 dark:text-zinc-300"
                  >
                    {day.label}{" "}
                    <span className="font-normal text-zinc-400">
                      — {formatDayLabel(day.date)}
                    </span>
                    {day.label === "Today" && (
                      <ResizeHandle
                        width={todayColWidth ?? MIN_TODAY_COL_WIDTH}
                        onResize={setTodayColWidth}
                        onReset={() => setTodayColWidth(null)}
                      />
                    )}
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
          My Shifts
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Log in with your name and password to see the shifts you&apos;re
          rostered for, and what&apos;s on today and tomorrow.
        </p>

        <StaffAccessGate>
          {(access) => <TodayEventsView {...access} />}
        </StaffAccessGate>
      </div>
    </div>
  );
}
