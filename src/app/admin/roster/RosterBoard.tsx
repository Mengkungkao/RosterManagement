"use client";

import { useMemo, useState } from "react";
import type { EventRecord } from "@/lib/events";
import type { StaffAvailability } from "@/lib/sheets";
import { DAYS } from "@/lib/availability";
import {
  buildWeeklyGrid,
  getAvailableStaff,
  getMelbourneWeekday,
  mod1440,
  toMinutes,
  type WindowAvailability,
} from "@/lib/roster-grid";

interface Props {
  events: EventRecord[];
  staff: StaffAvailability[];
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

export default function RosterBoard({ events, staff }: Props) {
  const grid = useMemo(() => buildWeeklyGrid(events), [events]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prepHours, setPrepHours] = useState(1);
  const [closingHours, setClosingHours] = useState(1);

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
      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="sticky left-0 z-10 w-16 bg-white px-2 py-2 font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                Time
              </th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  className="px-2 py-2 font-medium text-zinc-600 dark:text-zinc-400"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, hour) => (
              <tr
                key={hour}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1.5 align-top text-zinc-500 dark:bg-zinc-950 dark:text-zinc-500">
                  {formatHour(hour)}
                </td>
                {DAYS.map((day) => {
                  const cell = grid[day][hour];
                  return (
                    <td key={day} className="px-1.5 py-1.5 align-top">
                      <div className="space-y-1">
                        {cell.events.map((event, i) => (
                          <button
                            key={`${event.eventId}-${i}`}
                            type="button"
                            onClick={() => setSelectedId(event.eventId)}
                            className={`block w-full rounded px-1.5 py-1 text-left leading-tight transition-opacity hover:opacity-80 ${colorForEvent(event.eventId)}`}
                          >
                            <div className="font-medium">{event.name}</div>
                            {event.location && (
                              <div className="opacity-80">{event.location}</div>
                            )}
                            {event.phaseLabel && (
                              <div className="opacity-80">{event.phaseLabel}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
