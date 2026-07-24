"use client";

import { useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/lib/events";
import type { StaffAvailability } from "@/lib/sheets";
import { DAYS, type Day } from "@/lib/availability";
import AdminNav from "../AdminNav";
import {
  buildWeekLayout,
  getAvailableStaff,
  getDayShifts,
  getMelbourneWeekday,
  mod1440,
  toMinutes,
  type PositionedEvent,
  type StaffDayShift,
  type WindowAvailability,
} from "@/lib/roster-grid";

interface Props {
  events: EventRecord[];
  staff: StaffAvailability[];
}

// The grid fills whatever height its container has (see the desktop grid's
// flex-1/min-h-0 chain) rather than a fixed pixel row height, so the whole
// day fits on screen without a vertical scrollbar. Every row position below
// is a percentage of that container height.
const HOURS_IN_DAY = 24;
const MIN_BLOCK_PERCENT = 100 / HOURS_IN_DAY / 2; // half an hour tall, minimum
const MIN_CARD_HEIGHT = 22; // px floor so a card is never literally unreadable

// Phone view keeps the old fixed-height, scroll-if-needed behaviour — there's
// only one column, so there's no room to save by shrinking rows.
const MOBILE_ROW_HEIGHT = 64; // px per hour
const MOBILE_TOTAL_HEIGHT = MOBILE_ROW_HEIGHT * HOURS_IN_DAY;

// Column width: auto-sized from how busy each day is, with manual drag as an override.
const EMPTY_DAY_COL_WIDTH = 110; // px — no events at all
const SINGLE_EVENT_COL_WIDTH = 150; // px — exactly one event, nothing overlapping
const BUSY_COL_WIDTH = 210; // px — baseline once a day has multiple events
const PER_TRACK_WIDTH = 170; // px needed per side-by-side overlapping event
const PER_EVENT_GROWTH = 22; // px added per extra event beyond two, for readability
const MIN_COL_WIDTH = 100;
const MAX_COL_WIDTH = 520;

function computeAutoColumnWidth(positionedEvents: PositionedEvent[]): number {
  const eventCount = positionedEvents.length;
  if (eventCount === 0) return EMPTY_DAY_COL_WIDTH;
  if (eventCount === 1) return SINGLE_EVENT_COL_WIDTH;

  const trackCount = positionedEvents.reduce((max, pe) => Math.max(max, pe.trackCount), 1);
  const widthForOverlap = trackCount * PER_TRACK_WIDTH;
  const widthForDensity = BUSY_COL_WIDTH + (eventCount - 2) * PER_EVENT_GROWTH;
  return Math.min(MAX_COL_WIDTH, Math.max(widthForOverlap, widthForDensity));
}

interface Segment {
  label: string;
  start: number;
  end: number;
}

const EVENT_COLORS = [
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
];

function colorForEvent(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatMinutes(totalMinutes: number): string {
  const t = mod1440(totalMinutes);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function buildSegments(event: EventRecord): Segment[] {
  const start = toMinutes(event.startTime);
  let end = toMinutes(event.endTime);
  if (end <= start) end += 1440; // overnight event

  const breakpoints = [{ time: start, label: "Start" }];
  for (const phase of event.phases) {
    let time = phase.time ? toMinutes(phase.time) : start;
    if (time < start) time += 1440;
    if (time > start && time < end) breakpoints.push({ time, label: phase.label });
  }
  breakpoints.sort((a, b) => a.time - b.time);

  const merged: { time: number; label: string }[] = [];
  for (const bp of breakpoints) {
    const last = merged[merged.length - 1];
    if (last && last.time === bp.time) {
      last.label = `${last.label} + ${bp.label}`;
    } else {
      merged.push({ ...bp });
    }
  }

  return merged.map((bp, i) => ({
    label: bp.label,
    start: bp.time,
    end: i + 1 < merged.length ? merged[i + 1].time : end,
  }));
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MONTH_ABBR[month - 1] ?? ""}`.trim();
}

function DayShiftList({ shifts }: { shifts: StaffDayShift[] }) {
  if (shifts.length === 0) {
    return (
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">No one available.</p>
    );
  }
  return (
    <div className="mt-1 space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
      {shifts.map((shift) => (
        <div key={shift.staffName} className="flex items-center justify-between gap-2">
          <span>{shift.staffName}</span>
          <span className="tabular-nums text-zinc-400 dark:text-zinc-500">{shift.label}</span>
        </div>
      ))}
    </div>
  );
}

function StaffList({ items }: { items: WindowAvailability[] }) {
  if (items.length === 0) {
    return (
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        No one available.
      </p>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((person) => (
        <span
          key={person.staffName}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            person.coverage === "full"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {person.staffName}
          {person.coverage === "partial" && " (partial)"}
        </span>
      ))}
    </div>
  );
}

function EventBlock({
  pe,
  onSelect,
}: {
  pe: PositionedEvent;
  onSelect: () => void;
}) {
  const duration = pe.endMin - pe.startMin;
  // Sorted chronologically, untimed phases (no set time — "at the start of
  // the event") first, so the list always reads top-to-bottom in order.
  const sortedPhases = [...pe.event.phases].sort((a, b) => {
    const aTime = a.time ? toMinutes(a.time) : pe.startMin;
    const bTime = b.time ? toMinutes(b.time) : pe.startMin;
    return aTime - bTime;
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute flex flex-col overflow-hidden rounded text-left text-[11px] leading-tight transition-opacity hover:opacity-80 ${colorForEvent(pe.event.id)}`}
      style={{
        top: `${(pe.startMin / 1440) * 100}%`,
        // No fixed height: the card grows to fit however much it's showing
        // (name, location, phases) instead of clipping to the event's time
        // span. The time span still sets a *minimum*, so a long event never
        // looks shorter than it actually runs.
        minHeight: `max(${MIN_CARD_HEIGHT}px, ${Math.max((duration / 1440) * 100, MIN_BLOCK_PERCENT)}%)`,
        left: `calc(${(pe.track / pe.trackCount) * 100}% + 2px)`,
        width: `calc(${100 / pe.trackCount}% - 4px)`,
      }}
    >
      {/* Header always renders first — a real flex-column child, not an
          absolutely-positioned overlay — so nothing can ever paint over it
          or reorder it ahead of the event name. */}
      <div className="shrink-0 px-1.5 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold">{pe.event.name}</span>
          <span className="tabular-nums opacity-80">
            {formatShortDate(pe.event.date)} · {pe.event.startTime}–{pe.event.endTime}
          </span>
        </div>
        {pe.event.location && <div className="opacity-80">{pe.event.location}</div>}
      </div>

      {sortedPhases.length > 0 && (
        <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden px-1.5 pt-0.5 pb-1 opacity-90">
          {sortedPhases.map((phase, i) => (
            <div key={i} className="flex gap-1 truncate">
              {phase.time && <span className="font-semibold tabular-nums">{phase.time}</span>}
              <span className="truncate">{phase.label}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function HourGridlines() {
  return (
    <>
      {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
        <div
          key={hour}
          className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-900"
          style={{ top: `${(hour / HOURS_IN_DAY) * 100}%` }}
        />
      ))}
    </>
  );
}

function DayColumn({
  positionedEvents,
  onSelect,
}: {
  positionedEvents: PositionedEvent[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative h-full border-l border-zinc-100 dark:border-zinc-900">
      <HourGridlines />
      {positionedEvents.map((pe) => (
        <EventBlock key={pe.event.id} pe={pe} onSelect={() => onSelect(pe.event.id)} />
      ))}
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="sticky left-0 z-10 h-full bg-white dark:bg-zinc-950">
      {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
        <div
          key={hour}
          className="absolute inset-x-0 border-t border-zinc-100 px-2 text-[11px] text-zinc-400 dark:border-zinc-900 dark:text-zinc-500"
          style={{
            top: `${(hour / HOURS_IN_DAY) * 100}%`,
            height: `${100 / HOURS_IN_DAY}%`,
          }}
        >
          {formatHour(hour)}
        </div>
      ))}
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
      MIN_COL_WIDTH,
      Math.min(MAX_COL_WIDTH, dragState.current.startWidth + delta)
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

export default function RosterBoard({ events, staff }: Props) {
  const layout = useMemo(() => buildWeekLayout(events), [events]);
  // Who's on for each day is derived straight from availability — no fetch,
  // no saved-assignment state. It's always live, whether or not the sheet
  // has ever been saved.
  const dayShifts = useMemo(
    () => Object.fromEntries(DAYS.map((day) => [day, getDayShifts(staff, day)])) as Record<
      Day,
      StaffDayShift[]
    >,
    [staff]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Day>(DAYS[0]);

  // Columns auto-size to how busy each day is; a manual drag pins that day's
  // width until reset (double-click the handle), so it won't jump around as
  // events change elsewhere in the week.
  const [manualColWidths, setManualColWidths] = useState<(number | null)[]>(() =>
    DAYS.map(() => null)
  );
  const autoColWidths = useMemo(
    () => DAYS.map((day) => computeAutoColumnWidth(layout[day])),
    [layout]
  );
  const colWidths = useMemo(
    () => DAYS.map((_, i) => manualColWidths[i] ?? autoColWidths[i]),
    [manualColWidths, autoColWidths]
  );
  // Manually-resized days get a fixed pixel track; everything else is a
  // proportional `fr` track sized by the same auto-width weights, so the
  // columns always add up to exactly the available width — no horizontal
  // scrollbar for the default (non-dragged) case.
  const colTracks = useMemo(
    () =>
      DAYS.map((_, i) =>
        manualColWidths[i] !== null ? `${manualColWidths[i]}px` : `${autoColWidths[i]}fr`
      ),
    [manualColWidths, autoColWidths]
  );
  const [prepHours, setPrepHours] = useState(1);
  const [closingHours, setClosingHours] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  async function handleSave() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Save this week's roster to Google Sheets now? This overwrites any previously saved roster."
      )
    ) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/roster/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save roster");
      setSaveMessage({
        type: "success",
        text: `Saved — ${data.days} day${data.days === 1 ? "" : "s"}, ${data.staff} staff.`,
      });
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save roster",
      });
    } finally {
      setSaving(false);
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;

  const details = useMemo(() => {
    if (!selectedEvent) return null;
    const weekday = getMelbourneWeekday(selectedEvent.date);
    const start = toMinutes(selectedEvent.startTime);
    const end = toMinutes(selectedEvent.endTime);
    const prepMinutes = Math.round(prepHours * 60);
    const closingMinutes = Math.round(closingHours * 60);

    return {
      weekday,
      prepWindow: { start: start - prepMinutes, end: start },
      prepStaff: getAvailableStaff(staff, weekday, start - prepMinutes, start),
      segments: buildSegments(selectedEvent).map((seg) => ({
        ...seg,
        staff: getAvailableStaff(staff, weekday, seg.start, seg.end),
      })),
      closingWindow: { start: end, end: end + closingMinutes },
      closingStaff: getAvailableStaff(staff, weekday, end, end + closingMinutes),
    };
  }, [selectedEvent, staff, prepHours, closingHours]);

  return (
    <>
      <AdminNav
        right={
          <>
            <span className="text-zinc-600 dark:text-zinc-400">
              
              {saveMessage && (
                <span
                  className={`ml-2 ${
                    saveMessage.type === "success"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {saveMessage.text}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "Saving…" : "Save roster to Google Sheets"}
            </button>
          </>
        }
      />

      {/* Phone/tablet: one day at a time, full width, no drag-resize (nothing to trade width with). */}
      <div className="mt-4 md:hidden">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium whitespace-nowrap ${
                selectedDay === day
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <div
          className="mt-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          style={{ maxHeight: "70vh" }}
        >
          <div className="flex" style={{ height: MOBILE_TOTAL_HEIGHT }}>
            <TimeGutter />
            <div className="flex-1">
              <DayColumn positionedEvents={layout[selectedDay]} onSelect={setSelectedId} />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop/tablet-landscape: full week, sized to fit the screen with no scrollbar. */}
      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:flex md:min-h-0 md:flex-1 md:flex-col dark:border-zinc-800 dark:bg-zinc-950">
        <div
          className="grid min-h-0 flex-1 overflow-auto"
          style={{
            gridTemplateColumns: `56px ${colTracks.join(" ")}`,
            gridTemplateRows: "auto 1fr",
          }}
        >
          <div className="sticky top-0 left-0 z-30 border-b border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            Time
          </div>
          {DAYS.map((day, i) => (
            <div
              key={day}
              className="sticky top-0 z-20 relative border-b border-l border-zinc-200 bg-white px-2 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
            >
              {day}
              <ResizeHandle
                width={colWidths[i]}
                onResize={(newWidth) =>
                  setManualColWidths((prev) => prev.map((w, wi) => (wi === i ? newWidth : w)))
                }
                onReset={() =>
                  setManualColWidths((prev) => prev.map((w, wi) => (wi === i ? null : w)))
                }
              />
            </div>
          ))}

          <TimeGutter />

          {DAYS.map((day) => (
            <DayColumn key={day} positionedEvents={layout[day]} onSelect={setSelectedId} />
          ))}
        </div>
      </div>

      {selectedEvent && details && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {selectedEvent.name}
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedEvent.date} ({details.weekday}) · {selectedEvent.startTime}
                  –{selectedEvent.endTime}
                  {selectedEvent.location && ` · ${selectedEvent.location}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <section className="mt-5">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Staff working {details.weekday}
              </h3>
              <DayShiftList shifts={dayShifts[details.weekday]} />
            </section>

            <section className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Setup / prep
                </h3>
                <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <input
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    value={prepHours}
                    onChange={(e) => setPrepHours(Number(e.target.value) || 0)}
                    className="w-14 rounded border border-zinc-300 px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  h before start
                </label>
              </div>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {formatMinutes(details.prepWindow.start)}–{formatMinutes(details.prepWindow.end)}
              </p>
              <StaffList items={details.prepStaff} />
            </section>

            <section className="mt-5">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                During the event
              </h3>
              <div className="mt-2 space-y-3">
                {details.segments.map((seg, i) => (
                  <div key={i}>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {formatMinutes(seg.start)}–{formatMinutes(seg.end)} · {seg.label}
                    </p>
                    <StaffList items={seg.staff} />
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Closing / pack-down
                </h3>
                <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <input
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    value={closingHours}
                    onChange={(e) => setClosingHours(Number(e.target.value) || 0)}
                    className="w-14 rounded border border-zinc-300 px-1 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  h after end
                </label>
              </div>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {formatMinutes(details.closingWindow.start)}–{formatMinutes(details.closingWindow.end)}
              </p>
              <StaffList items={details.closingStaff} />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
