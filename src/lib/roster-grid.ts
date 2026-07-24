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

// Current time of day in Melbourne, as minutes since midnight — client-safe
// (no server-only imports), used for the "now" indicator on a day grid.
export function getMelbourneMinutesNow(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return Number(get("hour")) * 60 + Number(get("minute"));
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

export interface StaffDayShift {
  staffName: string;
  label: string; // "16:30-24:00", or "All day"
}

// Every staff member who's available on the given weekday, with their own
// submitted hours as their shift label. No headcount, no picking — everyone
// available goes on the list.
export function getDayShifts(staff: StaffAvailability[], day: Day): StaffDayShift[] {
  const shifts: StaffDayShift[] = [];
  for (const person of staff) {
    const availability = person.week[day];
    if (availability.status === "unavailable") continue;
    shifts.push({
      staffName: person.staffName,
      label:
        availability.status === "available_all_day"
          ? "All day"
          : `${availability.startTime}-${availability.endTime}`,
    });
  }
  return shifts.sort((a, b) => a.staffName.localeCompare(b.staffName));
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

// The event card's rendered height isn't clipped to its time span — it grows
// to fit its header, location, and actions (see EventBlock's minHeight
// comment) — so a short but content-heavy event can visually spill past its
// own end time into a closely-following event below it. Rough estimate of
// how many minutes' worth of vertical space one line of card content needs,
// so that case gets caught during track assignment (below) and the two
// events are placed side by side instead of overlapping. This is a heuristic
// tuned for typical desktop screen heights, not a pixel-exact measurement —
// raise it if content-heavy cards still visually overlap the next event on
// your screens, lower it if events end up side by side more than necessary.
const MINUTES_PER_CONTENT_LINE = 35;

export type ContentLineEstimator = (event: EventRecord) => number;

// Default estimate: header line + location line (if any) + one line per
// action, since that's what the admin roster grid's card actually renders.
// Views that render actions elsewhere (e.g. a separate activity timeline)
// should pass their own estimator to layoutDayEvents instead.
const estimateContentLines: ContentLineEstimator = (event) =>
  1 + (event.location ? 1 : 0) + event.actions.length;

// Assigns each of a day's events to the first side-by-side "track" that's free
// (the classic interval-partitioning / minimum-meeting-rooms algorithm), so
// overlapping events land in separate columns instead of stacking in one cell.
// `trackEnd` (rather than the event's real `end`) drives that placement, so
// content-heavy events that are likely to render taller than their time span
// also get pushed into a new track when needed — see MINUTES_PER_CONTENT_LINE.
function assignTracks(
  items: { event: EventRecord; start: number; end: number; trackEnd: number }[]
): PositionedEvent[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const trackEnds: number[] = [];
  const positioned: PositionedEvent[] = [];

  for (const item of sorted) {
    let track = trackEnds.findIndex((end) => end <= item.start);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(item.trackEnd);
    } else {
      trackEnds[track] = item.trackEnd;
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

// Lays out a single day's events as continuous, non-overlapping blocks — one
// block per event (not repeated per hour), with concurrent (or visually
// colliding, see MINUTES_PER_CONTENT_LINE) events placed in side-by-side
// tracks rather than stacked in the same slot. Shared by the weekly roster
// grid (one call per weekday) and any other single-day view of events.
export function layoutDayEvents(
  events: EventRecord[],
  estimateLines: ContentLineEstimator = estimateContentLines
): PositionedEvent[] {
  const items = events.map((event) => {
    const start = toMinutes(event.startTime);
    const end = toMinutes(event.endTime);
    // Overnight events are clipped to the end of this day for display; the
    // detail panel's prep/segment/closing math still wraps correctly.
    const clippedEnd = end <= start ? MINUTES_IN_DAY : end;
    const contentMinutes = estimateLines(event) * MINUTES_PER_CONTENT_LINE;
    const trackEnd = start + Math.max(clippedEnd - start, contentMinutes);
    return { event, start, end: clippedEnd, trackEnd };
  });
  return assignTracks(items);
}

// Groups events by weekday (in Melbourne time) and lays out each day independently.
export function buildWeekLayout(events: EventRecord[]): WeekLayout {
  const byDay = DAYS.reduce((acc, day) => {
    acc[day] = [];
    return acc;
  }, {} as Record<Day, EventRecord[]>);

  for (const event of events) {
    byDay[getMelbourneWeekday(event.date)].push(event);
  }

  return DAYS.reduce((layout, day) => {
    layout[day] = layoutDayEvents(byDay[day]);
    return layout;
  }, {} as WeekLayout);
}
