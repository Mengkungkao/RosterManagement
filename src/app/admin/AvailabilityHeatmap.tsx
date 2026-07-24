"use client";

import { useMemo, useState } from "react";
import type { StaffAvailability } from "@/lib/sheets";
import { DAYS, type Day } from "@/lib/availability";
import { overlaps, toMinutes } from "@/lib/roster-grid";

interface Props {
  staff: StaffAvailability[];
}

interface HourCell {
  available: string[];
  unavailable: string[];
}

type Heatmap = Record<Day, HourCell[]>;

const HOURS = 24;

// Sequential scale (magnitude: how many people are free), one hue light→dark
// — continuous rather than a handful of fixed buckets, so the number of
// visually distinct shades scales with headcount: a team of 6 gets 7 distinct
// steps (0..6 available), a team of 20 gets 21. A fixed small palette would
// collide once headcount exceeded its step count (5/6 and 6/6 looked
// identical before). "Reverse Deep Forest": near-black forest green at 0%,
// deepening up to a mid green at 100% — same ramp in both themes.
type RGB = readonly [number, number, number];
const RAMP_FROM: RGB = [4, 20, 0]; // #04281e — near-black forest green
const RAMP_TO: RGB = [52, 130, 96]; // #348260 — mid green
const LIGHT_FROM: RGB = RAMP_FROM;
const LIGHT_TO: RGB = RAMP_TO;
const DARK_FROM: RGB = RAMP_FROM;
const DARK_TO: RGB = RAMP_TO;

function rgbString([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

function mix(from: RGB, to: RGB, ratio: number): string {
  const r = Math.round(from[0] + (to[0] - from[0]) * ratio);
  const g = Math.round(from[1] + (to[1] - from[1]) * ratio);
  const b = Math.round(from[2] + (to[2] - from[2]) * ratio);
  return `rgb(${r} ${g} ${b})`;
}

function cellColorVars(ratio: number): React.CSSProperties {
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    "--cell-light": mix(LIGHT_FROM, LIGHT_TO, clamped),
    "--cell-dark": mix(DARK_FROM, DARK_TO, clamped),
  } as React.CSSProperties;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function buildHeatmap(staff: StaffAvailability[]): Heatmap {
  const heatmap = {} as Heatmap;
  for (const day of DAYS) {
    heatmap[day] = Array.from({ length: HOURS }, (_, hour) => {
      const hourStart = hour * 60;
      const hourEnd = hourStart + 60;
      const available: string[] = [];
      const unavailable: string[] = [];

      for (const person of staff) {
        const d = person.week[day];
        if (d.status === "unavailable") {
          unavailable.push(person.staffName);
          continue;
        }
        if (d.status === "available_all_day") {
          available.push(person.staffName);
          continue;
        }
        const isFree = overlaps(hourStart, hourEnd, toMinutes(d.startTime), toMinutes(d.endTime));
        (isFree ? available : unavailable).push(person.staffName);
      }

      return { available, unavailable };
    });
  }
  return heatmap;
}

export default function AvailabilityHeatmap({ staff }: Props) {
  const heatmap = useMemo(() => buildHeatmap(staff), [staff]);
  const [active, setActive] = useState<{ day: Day; hour: number } | null>(null);
  const total = staff.length;

  const activeCell = active ? heatmap[active.day][active.hour] : null;

  return (
    <div className="mt-6 flex flex-col gap-[22px] lg:flex-row">
      <div className="w-full shrink-0 rounded-2xl border border-zinc-200 bg-white p-[18px] shadow-sm lg:w-[230px] dark:border-zinc-800 dark:bg-zinc-950">
        {activeCell && active ? (
          <>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {activeCell.available.length}/{total} available
            </p>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {active.day} {formatHour(active.hour)}
            </p>
            <div className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                Available
              </h3>
              {activeCell.available.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                  {activeCell.available.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">No one</p>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Unavailable
              </h3>
              {activeCell.unavailable.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {activeCell.unavailable.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">No one</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Hover or tap a cell on the grid to see who&apos;s available at that day and
            hour.
          </p>
        )}
      </div>

      <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white p-[18px] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
            Group&apos;s Availability
          </h2>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              0/{total}
            </span>
            <div
              className="h-[11px] w-[100px] overflow-hidden rounded-full bg-[linear-gradient(to_right,var(--legend-light-from),var(--legend-light-to))] ring-1 ring-zinc-200 dark:bg-[linear-gradient(to_right,var(--legend-dark-from),var(--legend-dark-to))] dark:ring-zinc-800"
              style={
                {
                  "--legend-light-from": rgbString(LIGHT_FROM),
                  "--legend-light-to": rgbString(LIGHT_TO),
                  "--legend-dark-from": rgbString(DARK_FROM),
                  "--legend-dark-to": rgbString(DARK_TO),
                } as React.CSSProperties
              }
            />
            <span>
              {total}/{total}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Hover or tap the calendar to see who&apos;s available.
        </p>

        <div
          className="mt-4 overflow-x-auto"
          onMouseLeave={() => setActive(null)}
        >
          <table className="w-full min-w-[500px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-[50px] bg-white px-1 py-1 text-left font-medium text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400" />
                {DAYS.map((day) => (
                  <th
                    key={day}
                    className="px-1 py-1 text-center font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: HOURS }, (_, hour) => (
                <tr key={hour}>
                  <td className="sticky left-0 z-10 bg-white px-1 py-0 text-right text-[11px] text-zinc-400 dark:bg-zinc-950 dark:text-zinc-500">
                    {formatHour(hour)}
                  </td>
                  {DAYS.map((day) => {
                    const cell = heatmap[day][hour];
                    const ratio = total > 0 ? cell.available.length / total : 0;
                    const isActive = active?.day === day && active?.hour === hour;
                    return (
                      <td key={day} className="border border-zinc-100 p-0 leading-none dark:border-zinc-900">
                        <button
                          type="button"
                          onMouseEnter={() => setActive({ day, hour })}
                          onFocus={() => setActive({ day, hour })}
                          onClick={() => setActive({ day, hour })}
                          aria-label={`${day} ${formatHour(hour)}: ${cell.available.length} of ${total} available`}
                          style={cellColorVars(ratio)}
                          className={`block h-[22px] w-full bg-[var(--cell-light)] transition-shadow dark:bg-[var(--cell-dark)] ${
                            isActive
                              ? "ring-2 ring-inset ring-zinc-900 dark:ring-white"
                              : "hover:ring-1 hover:ring-inset hover:ring-zinc-400 dark:hover:ring-zinc-500"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
