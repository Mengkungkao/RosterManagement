"use client";

import { useMemo, useState } from "react";
import { DAYS, type Day } from "@/lib/availability";
import { addDays } from "@/lib/dates";
import { checkAvailability } from "@/lib/roster";
import type { StaffMember } from "@/lib/staff";
import { Card } from "../ui/Card";

interface Props {
  staff: StaffMember[];
}

// Any Monday: availability repeats weekly, so the grid is computed for one
// sample week. Overnight hours ("Mon 22:00–06:00") land on the next morning.
const SAMPLE_MONDAY = "2026-01-05";

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

function buildHeatmap(staff: StaffMember[]): Heatmap {
  const heatmap = {} as Heatmap;
  DAYS.forEach((day, d) => {
    const date = addDays(SAMPLE_MONDAY, d);
    heatmap[day] = Array.from({ length: HOURS }, (_, hour) => {
      const available: string[] = [];
      const unavailable: string[] = [];
      for (const person of staff) {
        const { coverage } = checkAvailability(person.week, date, { start: hour * 60, end: hour * 60 + 60 });
        (coverage === "none" ? unavailable : available).push(person.staffName);
      }
      return { available, unavailable };
    });
  });
  return heatmap;
}

export default function AvailabilityHeatmap({ staff }: Props) {
  const heatmap = useMemo(() => buildHeatmap(staff), [staff]);
  const [active, setActive] = useState<{ day: Day; hour: number } | null>(null);
  const total = staff.length;

  const activeCell = active ? heatmap[active.day][active.hour] : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card as="div" className="w-full shrink-0 p-4 lg:w-[230px]">
        {activeCell && active ? (
          <>
            <p className="text-lg font-semibold text-fg">
              {activeCell.available.length}/{total} available
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {active.day} {formatHour(active.hour)}
            </p>
            <div className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-success uppercase">
                Available
              </h3>
              {activeCell.available.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-fg-2">
                  {activeCell.available.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-subtle">No one</p>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                Unavailable
              </h3>
              {activeCell.unavailable.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-muted">
                  {activeCell.unavailable.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-subtle">No one</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            Hover or tap a cell on the grid to see who&apos;s available at that day and
            hour.
          </p>
        )}
      </Card>

      <Card as="div" className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">
            Who&apos;s free when
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              0/{total}
            </span>
            <div
              className="h-[11px] w-[100px] overflow-hidden rounded-full bg-[linear-gradient(to_right,var(--legend-light-from),var(--legend-light-to))] ring-1 ring-line dark:bg-[linear-gradient(to_right,var(--legend-dark-from),var(--legend-dark-to))]"
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
        <p className="mt-1 text-xs text-muted">
          A typical week from everyone&apos;s weekly availability (not date exceptions). Hover or tap an hour to see who&apos;s free.
        </p>

        <div
          className="mt-4 overflow-x-auto"
          onMouseLeave={() => setActive(null)}
        >
          <table className="w-full min-w-[500px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-[50px] bg-surface px-1 py-1 text-left font-medium text-muted" />
                {DAYS.map((day) => (
                  <th
                    key={day}
                    className="px-1 py-1 text-center font-medium text-muted"
                  >
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: HOURS }, (_, hour) => (
                <tr key={hour}>
                  <td className="sticky left-0 z-10 bg-surface px-1 py-0 text-right text-[11px] text-muted tabular-nums">
                    {formatHour(hour)}
                  </td>
                  {DAYS.map((day) => {
                    const cell = heatmap[day][hour];
                    const ratio = total > 0 ? cell.available.length / total : 0;
                    const isActive = active?.day === day && active?.hour === hour;
                    return (
                      <td key={day} className="border border-line p-0 leading-none">
                        <button
                          type="button"
                          onMouseEnter={() => setActive({ day, hour })}
                          onFocus={() => setActive({ day, hour })}
                          onClick={() => setActive({ day, hour })}
                          aria-label={`${day} ${formatHour(hour)}: ${cell.available.length} of ${total} available`}
                          style={cellColorVars(ratio)}
                          className={`block h-[22px] w-full bg-[var(--cell-light)] transition-shadow dark:bg-[var(--cell-dark)] ${
                            isActive
                              ? "ring-2 ring-inset ring-white"
                              : "hover:ring-1 hover:ring-inset hover:ring-white/60"
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
      </Card>
    </div>
  );
}
