import { DAYS, type Day } from "./availability";
import type { EventRecord } from "./events";
import type { StaffAvailability } from "./sheets";

const HOURS_IN_DAY = 24;
const MINUTES_IN_DAY = 1440;

export interface GridEventChip {
  eventId: string;
  name: string;
  location: string;
  phaseLabel?: string;
}

export interface HourCell {
  hour: number;
  events: GridEventChip[];
}

export type WeeklyGrid = Record<Day, HourCell[]>;

export interface WindowAvailability {
  staffName: string;
  coverage: "full" | "partial";
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function mod1440(minutes: number): number {
  return ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

// Splits a (possibly overnight) [start,end) range into one or two same-day segments.
function toSegments(start: number, end: number): [number, number][] {
  return start <= end
    ? [[start, end]]
    : [
        [start, MINUTES_IN_DAY],
        [0, end],
      ];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const segA = toSegments(aStart, aEnd);
  const segB = toSegments(bStart, bEnd);
  return segA.some(([s1, e1]) => segB.some(([s2, e2]) => s1 < e2 && s2 < e1));
}

function contains(
  outerStart: number,
  outerEnd: number,
  innerStart: number,
  innerEnd: number
) {
  const outerSegs = toSegments(outerStart, outerEnd);
  const innerSegs = toSegments(innerStart, innerEnd);
  return innerSegs.every(([is, ie]) =>
    outerSegs.some(([os, oe]) => os <= is && ie <= oe)
  );
}

export function isWithinWindow(start: number, end: number, point: number): boolean {
  return toSegments(start, end).some(([s, e]) => s <= point && point < e);
}

export function getMelbourneWeekday(dateStr: string): Day {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne",
    weekday: "long",
  }).format(date);
  return weekday as Day;
}

// Staff available (fully or partially) during [startMin, endMin) on the given weekday.
// Bounds are taken mod 24h, so a window that spans midnight (start > end) wraps correctly.
export function getAvailableStaff(
  staff: StaffAvailability[],
  weekday: Day,
  startMin: number,
  endMin: number
): WindowAvailability[] {
  const start = mod1440(startMin);
  const end = mod1440(endMin);
  const results: WindowAvailability[] = [];

  for (const person of staff) {
    const day = person.week[weekday];
    if (day.status === "unavailable") continue;

    if (day.status === "available_all_day") {
      results.push({ staffName: person.staffName, coverage: "full" });
      continue;
    }

    const staffStart = toMinutes(day.startTime);
    const staffEnd = toMinutes(day.endTime);
    if (!overlaps(start, end, staffStart, staffEnd)) continue;

    results.push({
      staffName: person.staffName,
      coverage: contains(staffStart, staffEnd, start, end) ? "full" : "partial",
    });
  }

  return results.sort((a, b) => a.staffName.localeCompare(b.staffName));
}

// Staff available at a specific point in time on the given weekday.
export function getAvailableStaffAt(
  staff: StaffAvailability[],
  weekday: Day,
  pointMin: number
): string[] {
  const point = mod1440(pointMin);
  const names: string[] = [];

  for (const person of staff) {
    const day = person.week[weekday];
    if (day.status === "unavailable") continue;
    if (day.status === "available_all_day") {
      names.push(person.staffName);
      continue;
    }
    if (isWithinWindow(toMinutes(day.startTime), toMinutes(day.endTime), point)) {
      names.push(person.staffName);
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}

function emptyGrid(): WeeklyGrid {
  return DAYS.reduce((grid, day) => {
    grid[day] = Array.from({ length: HOURS_IN_DAY }, (_, hour) => ({
      hour,
      events: [],
    }));
    return grid;
  }, {} as WeeklyGrid);
}

export function buildWeeklyGrid(events: EventRecord[]): WeeklyGrid {
  const grid = emptyGrid();

  for (const event of events) {
    const weekday = getMelbourneWeekday(event.date);
    const startMin = toMinutes(event.startTime);
    const endMin = toMinutes(event.endTime);

    const phaseLabelByHour = new Map<number, string>();
    for (const phase of event.phases) {
      if (!phase.time) continue;
      const hour = Math.floor(toMinutes(phase.time) / 60);
      const existing = phaseLabelByHour.get(hour);
      phaseLabelByHour.set(hour, existing ? `${existing} · ${phase.label}` : phase.label);
    }

    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      if (!overlaps(startMin, endMin, hour * 60, hour * 60 + 60)) continue;
      grid[weekday][hour].events.push({
        eventId: event.id,
        name: event.name,
        location: event.location,
        phaseLabel: phaseLabelByHour.get(hour),
      });
    }
  }

  return grid;
}
