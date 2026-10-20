// Breaks and worked time. Pure functions only.
//
// Rules (the venue's, within the Hospitality Award's cl. 16 break rules):
// - nobody works more than 6 hours in a row: a shift longer than 6h gets an
//   unpaid 30-minute break between 4h and 6h after the start (two breaks if
//   one isn't enough), spread evenly;
// - nobody works more than 12 hours (after breaks) in one day;
// - when someone is on overlapping functions at once (shared staff), the time
//   is counted once.

export const BREAK_MINUTES = 30;
export const MAX_STRETCH_MINUTES = 6 * 60;
export const MIN_BEFORE_BREAK_MINUTES = 4 * 60;
export const DAILY_MAX_WORK_MINUTES = 12 * 60;
// The longest shift one person can take: 12h of work plus the break it needs.
export const MAX_SHIFT_SPAN_MINUTES = DAILY_MAX_WORK_MINUTES + BREAK_MINUTES;

export type Interval = [start: number, end: number];

export interface WorkBlock {
  start: number;
  end: number;
  breaks: Interval[]; // unpaid
  workedMinutes: number;
}

const ceilTo15 = (minutes: number) => Math.ceil(minutes / 15) * 15;

// Where the breaks go in a continuous stretch at work of `span` minutes, as
// offsets from its start: each work stretch is 4–6h, the last one at most 6h.
export function breakOffsets(span: number): number[] {
  if (span <= MAX_STRETCH_MINUTES) return [];
  let count = 1;
  while (span - BREAK_MINUTES * count > MAX_STRETCH_MINUTES * (count + 1)) count++;
  const work = span - BREAK_MINUTES * count;
  const stretch = Math.min(
    MAX_STRETCH_MINUTES,
    Math.max(MIN_BEFORE_BREAK_MINUTES, ceilTo15(work / (count + 1)))
  );
  return Array.from({ length: count }, (_, i) => (i + 1) * stretch + i * BREAK_MINUTES);
}

export function workedMinutesFor(span: number): number {
  return span - breakOffsets(span).length * BREAK_MINUTES;
}

// Joins overlapping or touching intervals into continuous blocks at work, and
// puts the breaks in each.
export function workBlocks(intervals: Interval[]): WorkBlock[] {
  const sorted = [...intervals].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.map(([start, end]) => {
    const breaks = breakOffsets(end - start).map((o): Interval => [start + o, start + o + BREAK_MINUTES]);
    return { start, end, breaks, workedMinutes: end - start - breaks.length * BREAK_MINUTES };
  });
}

export function totalWorkedMinutes(intervals: Interval[]): number {
  return workBlocks(intervals).reduce((sum, b) => sum + b.workedMinutes, 0);
}

// The parts of a block actually worked (the block minus its breaks).
export function workedIntervals(block: WorkBlock): Interval[] {
  const parts: Interval[] = [];
  let from = block.start;
  for (const [bs, be] of block.breaks) {
    parts.push([from, bs]);
    from = be;
  }
  parts.push([from, block.end]);
  return parts;
}

// Splits a shift too long for one person (over 12h of work) into equal parts
// that each fit, e.g. 07:00–21:00 → 07:00–14:00 and 14:00–21:00.
export function splitIntoParts(start: number, end: number): Interval[] {
  const parts = Math.ceil((end - start) / MAX_SHIFT_SPAN_MINUTES);
  if (parts <= 1) return [[start, end]];
  const length = ceilTo15((end - start) / parts);
  return Array.from({ length: parts }, (_, i): Interval => [
    start + i * length,
    Math.min(end, start + (i + 1) * length),
  ]).filter(([s, e]) => e > s);
}
