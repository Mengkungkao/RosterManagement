import { MINUTES_IN_DAY, toMinutes } from "./dates";
import type { EventRecord } from "./events";

// Layout of one day's events as side-by-side blocks, for the staff "Today" view.

export interface PositionedEvent {
  event: EventRecord;
  startMin: number; // clipped to [0, 1440)
  endMin: number; // clipped to (startMin, 1440]
  track: number;
  trackCount: number;
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

// The event card's rendered height isn't clipped to its time span — it grows
// to fit its header, location, and actions — so a short but content-heavy event can visually spill past its
// own end time into a closely-following event below it. Rough estimate of
// how many minutes' worth of vertical space one line of card content needs,
// so that case gets caught during track assignment (below) and the two
// events are placed side by side instead of overlapping. This is a heuristic
// tuned for typical desktop screen heights, not a pixel-exact measurement —
// raise it if content-heavy cards still visually overlap the next event on
// your screens, lower it if events end up side by side more than necessary.
const MINUTES_PER_CONTENT_LINE = 35;

export type ContentLineEstimator = (event: EventRecord) => number;

// Default estimate: header line + location line (if any) + one line per action.
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
// tracks rather than stacked in the same slot.
export function layoutDayEvents(
  events: EventRecord[],
  estimateLines: ContentLineEstimator = estimateContentLines
): PositionedEvent[] {
  const items = events.map((event) => {
    const start = toMinutes(event.startTime);
    const end = toMinutes(event.endTime);
    // Overnight events are clipped to the end of this day for display.
    const clippedEnd = end <= start ? MINUTES_IN_DAY : end;
    const contentMinutes = estimateLines(event) * MINUTES_PER_CONTENT_LINE;
    const trackEnd = start + Math.max(clippedEnd - start, contentMinutes);
    return { event, start, end: clippedEnd, trackEnd };
  });
  return assignTracks(items);
}
