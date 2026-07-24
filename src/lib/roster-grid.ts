import { DAYS, type Day } from "./availability";
import type { EventRecord } from "./events";
import type { StaffAvailability } from "./sheets";

const MINUTES_IN_DAY = 1440;

export interface PositionedEvent {
  event: EventRecord;
  startMin: number; // clipped to [0, 1440)
  endMin: number; // clipped to (startMin, 1440]
  track: number;
  trackCount: number;
}

export type WeekLayout = Record<Day, PositionedEvent[]>;

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

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
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

// Assigns each of a day's events to the first side-by-side "track" that's free
// (the classic interval-partitioning / minimum-meeting-rooms algorithm), so
// overlapping events land in separate columns instead of stacking in one cell.
function assignTracks(
  items: { event: EventRecord; start: number; end: number }[]
): PositionedEvent[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const trackEnds: number[] = [];
  const positioned: PositionedEvent[] = [];

  for (const item of sorted) {
    let track = trackEnds.findIndex((end) => end <= item.start);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(item.end);
    } else {
      trackEnds[track] = item.end;
    }
    positioned.push({
      event: item.event,
      startMin: item.start,
      endMin: item.end,
      track,
      trackCount: 0, // filled in once the day's total track count is known
    });
  }

  const trackCount = trackEnds.length || 1;
  positioned.forEach((p) => (p.trackCount = trackCount));
  return positioned;
}

// Lays out events as continuous, non-overlapping blocks per weekday — one
// block per event (not repeated per hour), with concurrent events placed in
// side-by-side tracks rather than stacked inside the same slot.
export function buildWeekLayout(events: EventRecord[]): WeekLayout {
  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = [];
    return acc;
  }, {} as Record<Day, { event: EventRecord; start: number; end: number }[]>);

  for (const event of events) {
    const weekday = getMelbourneWeekday(event.date);
    const start = toMinutes(event.startTime);
    const end = toMinutes(event.endTime);
    // Overnight events are clipped to the end of this weekday for display;
    // the detail panel's prep/segment/closing math still wraps correctly.
    byDay[weekday].push({ event, start, end: end <= start ? MINUTES_IN_DAY : end });
  }

  return DAYS.reduce((layout, day) => {
    layout[day] = assignTracks(byDay[day]);
    return layout;
  }, {} as WeekLayout);
}
