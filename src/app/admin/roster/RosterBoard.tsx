"use client";

import { useMemo, useRef, useState } from "react";
import type { EventRecord } from "@/lib/events";
import type { StaffAvailability } from "@/lib/sheets";
import type { RosterAssignment } from "@/lib/roster-assignment";
import { DAYS, type Day } from "@/lib/availability";
import {
  buildWeekLayout,
  getAvailableStaff,
  getMelbourneWeekday,
  mod1440,
  toMinutes,
  type PositionedEvent,
  type WindowAvailability,
} from "@/lib/roster-grid";

interface Props {
  events: EventRecord[];
  staff: StaffAvailability[];
  initialAssignments: RosterAssignment[];
}

function byEventId(assignments: RosterAssignment[]): Record<string, RosterAssignment> {
  return Object.fromEntries(assignments.map((a) => [a.eventId, a]));
}

const ROW_HEIGHT = 80; // px per hour
const TOTAL_HEIGHT = ROW_HEIGHT * 24;
const MIN_BLOCK_PERCENT = (ROW_HEIGHT / 2 / TOTAL_HEIGHT) * 100;

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

function buildSchedule(event: EventRecord): { time: string; label: string }[] {
  const segments = buildSegments(event);
  if (segments.length === 0) return [];
  return [
    ...segments.map((seg) => ({ time: formatMinutes(seg.start), label: seg.label })),
    { time: formatMinutes(segments[segments.length - 1].end), label: "End" },
  ];
}

function RosteredStaff({ assignment }: { assignment: RosterAssignment }) {
  if (assignment.staffNeeded === 0) return null;
  return (
    <div className="mt-0.5 space-y-0.5">
      {assignment.assigned.map((person, i) => (
        <div key={i} className="truncate">
          ✓ {person.staffName}
          {person.coverage === "partial" && " (partial)"}
        </div>
      ))}
      {assignment.shortfall > 0 && (
        <div className="font-semibold text-red-700 dark:text-red-300">
          Short {assignment.shortfall}
        </div>
      )}
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
  assignment,
  onSelect,
}: {
  pe: PositionedEvent;
  assignment: RosterAssignment | undefined;
  onSelect: () => void;
}) {
  const duration = pe.endMin - pe.startMin;
  const timedPhases = pe.event.phases.filter((p) => p.time);
  const untimedPhases = pe.event.phases.filter((p) => !p.time);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`absolute overflow-hidden rounded px-1.5 py-1 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 ${colorForEvent(pe.event.id)}`}
      style={{
        top: `${(pe.startMin / 1440) * 100}%`,
        height: `${Math.max((duration / 1440) * 100, MIN_BLOCK_PERCENT)}%`,
        left: `calc(${(pe.track / pe.trackCount) * 100}% + 2px)`,
        width: `calc(${100 / pe.trackCount}% - 4px)`,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-semibold">{pe.event.name}</span>
        <span className="tabular-nums opacity-80">
          {formatShortDate(pe.event.date)} · {pe.event.startTime}–{pe.event.endTime}
        </span>
      </div>
      {pe.event.location && <div className="opacity-80">{pe.event.location}</div>}
      {untimedPhases.length > 0 && (
        <div className="mt-0.5 space-y-0.5 opacity-80">
          {untimedPhases.map((phase, i) => (
            <div key={i} className="truncate">
              {phase.label}
            </div>
          ))}
        </div>
      )}
      {assignment && (
        <div className="mt-0.5 border-t border-current/20 pt-0.5">
          <RosteredStaff assignment={assignment} />
        </div>
      )}

      {/* Phase markers, positioned to line up with their actual (day, time) coordinate on the grid */}
      {timedPhases.map((phase, i) => {
        const offset = ((toMinutes(phase.time) - pe.startMin) / duration) * 100;
        if (offset <= 0 || offset >= 100) return null;
        return (
          <div
            key={i}
            className="absolute inset-x-0 flex items-center gap-1 border-t border-current/40 bg-black/5 px-1.5 py-0.5 dark:bg-white/10"
            style={{ top: `${offset}%` }}
          >
            <span className="font-semibold tabular-nums">{phase.time}</span>
            <span className="truncate">{phase.label}</span>
          </div>
        );
      })}
    </button>
  );
}

function HourGridlines() {
  return (
    <>
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-900"
          style={{ top: hour * ROW_HEIGHT }}
        />
      ))}
    </>
  );
}

function DayColumn({
  positionedEvents,
  assignments,
  onSelect,
}: {
  positionedEvents: PositionedEvent[];
  assignments: Record<string, RosterAssignment>;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="relative border-l border-zinc-100 dark:border-zinc-900"
      style={{ height: TOTAL_HEIGHT }}
    >
      <HourGridlines />
      {positionedEvents.map((pe) => (
        <EventBlock
          key={pe.event.id}
          pe={pe}
          assignment={assignments[pe.event.id]}
          onSelect={() => onSelect(pe.event.id)}
        />
      ))}
    </div>
  );
}

function TimeGutter() {
  return (
    <div
      className="sticky left-0 z-10 bg-white dark:bg-zinc-950"
      style={{ height: TOTAL_HEIGHT }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="absolute inset-x-0 border-t border-zinc-100 px-2 text-[11px] text-zinc-400 dark:border-zinc-900 dark:text-zinc-500"
          style={{ top: hour * ROW_HEIGHT, height: ROW_HEIGHT }}
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
}: {
  width: number;
  onResize: (newWidth: number) => void;
}) {
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    dragState.current = { startX: e.clientX, startWidth: width };
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
      className="absolute top-0 right-0 z-40 h-full w-2.5 cursor-col-resize touch-none select-none hover:bg-zinc-300 active:bg-zinc-400 dark:hover:bg-zinc-700"
    />
  );
}

export default function RosterBoard({ events, staff, initialAssignments }: Props) {
  const layout = useMemo(() => buildWeekLayout(events), [events]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Day>(DAYS[0]);
  const [colWidths, setColWidths] = useState<number[]>(() => DAYS.map(() => DEFAULT_COL_WIDTH));
  const [prepHours, setPrepHours] = useState(1);
  const [closingHours, setClosingHours] = useState(1);
  const [assignments, setAssignments] = useState<Record<string, RosterAssignment>>(() =>
    byEventId(initialAssignments)
  );
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  async function handleGenerate() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Auto-assign the whole week's roster now? This overwrites any previously saved roster in Google Sheets."
      )
    ) {
      return;
    }
    setGenerating(true);
    setGenerateMessage(null);
    try {
      const res = await fetch("/api/admin/roster/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate roster");
      setAssignments(byEventId(data.assignments));
      setGenerateMessage({ type: "success", text: "Roster generated and saved to Google Sheets." });
    } catch (err) {
      setGenerateMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to generate roster",
      });
    } finally {
      setGenerating(false);
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;
  const selectedAssignment = selectedId ? assignments[selectedId] : undefined;

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

  const assignedCount = Object.keys(assignments).length;
  const filledCount = Object.values(assignments).filter((a) => a.shortfall === 0).length;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {assignedCount > 0 ? (
            <>
              Roster saved: <span className="font-medium text-zinc-900 dark:text-zinc-50">{filledCount}</span> of{" "}
              {assignedCount} events fully staffed.
            </>
          ) : (
            "No roster generated yet."
          )}
          {generateMessage && (
            <span
              className={`ml-2 ${
                generateMessage.type === "success"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {generateMessage.text}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {generating ? "Assigning…" : "Auto-assign roster"}
        </button>
      </div>

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
          <div className="flex">
            <TimeGutter />
            <div className="flex-1">
              <DayColumn
                positionedEvents={layout[selectedDay]}
                assignments={assignments}
                onSelect={setSelectedId}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop/tablet-landscape: full week, with drag-to-resize day columns. */}
      <div
        className="mt-4 hidden overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-950"
        style={{ maxHeight: "75vh" }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: "56px repeat(7, minmax(140px, 1fr))",
            minWidth: "1080px",
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
                  setColWidths((prev) => prev.map((w, wi) => (wi === i ? newWidth : w)))
                }
              />
            </div>
          ))}

          <TimeGutter />

          {DAYS.map((day) => (
            <DayColumn
              key={day}
              className="relative border-l border-zinc-100 dark:border-zinc-900"
              style={{ height: TOTAL_HEIGHT }}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-900"
                  style={{ top: hour * ROW_HEIGHT }}
                />
              ))}
              {layout[day].map((pe) => (
                <button
                  key={pe.event.id}
                  type="button"
                  onClick={() => setSelectedId(pe.event.id)}
                  className={`absolute overflow-hidden rounded px-1.5 py-1 text-left text-[11px] leading-tight transition-opacity hover:opacity-80 ${colorForEvent(pe.event.id)}`}
                  style={{
                    top: `${(pe.startMin / 1440) * 100}%`,
                    height: `${Math.max(((pe.endMin - pe.startMin) / 1440) * 100, MIN_BLOCK_PERCENT)}%`,
                    left: `calc(${(pe.track / pe.trackCount) * 100}% + 2px)`,
                    width: `calc(${100 / pe.trackCount}% - 4px)`,
                  }}
                >
                  <div className="font-semibold">{pe.event.name}</div>
                  {pe.event.location && (
                    <div className="opacity-80">{pe.event.location}</div>
                  )}
                  <div className="mt-0.5 space-y-0.5 border-t border-current/20 pt-0.5 opacity-80">
                    {buildSchedule(pe.event).map((item, i) => (
                      <div key={i} className="flex gap-1 tabular-nums">
                        <span>{item.time}</span>
                        <span className="truncate font-normal">{item.label}</span>
                      </div>
                    ))}
                  </div>
                  {assignments[pe.event.id] && (
                    <div className="mt-0.5 border-t border-current/20 pt-0.5">
                      <RosteredStaff assignment={assignments[pe.event.id]} />
                    </div>
                  )}
                </button>
              ))}
            </div>
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Rostered staff
                </h3>
                {selectedAssignment && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    Needed {selectedAssignment.staffNeeded}
                  </span>
                )}
              </div>
              {selectedAssignment ? (
                <>
                  <StaffList items={selectedAssignment.assigned} />
                  {selectedAssignment.shortfall > 0 && (
                    <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                      Short by {selectedAssignment.shortfall}.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Generated {selectedAssignment.generatedAt}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  Not yet rostered — run Auto-assign roster.
                </p>
              )}
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
