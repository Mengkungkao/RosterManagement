// Shifts, hour rules and auto-fill. Pure functions only (no sheet access), so
// the admin pages, the API and the tests all share exactly the same rules.

import type { WeekAvailability } from "./availability";
import {
  MINUTES_IN_DAY,
  addDays,
  dayNumber,
  daysBetween,
  formatHours,
  formatMinutes,
  formatWeekdayDate,
  fortnightStartFor,
  toMinutes,
  weekdayOf,
} from "./dates";
import {
  DAILY_MAX_HOURS,
  FULL_TIME_FORTNIGHT_HOURS,
  PART_TIME_MIN_WEEKLY_HOURS,
  STUDENT_MAX_FORTNIGHT_HOURS,
  softFortnightLimit,
  type EmploymentType,
} from "./employment";
import type { EventRecord, RosterEntry } from "./events";
import {
  type Interval,
  BREAK_MINUTES,
  breakOffsets,
  splitIntoParts,
  totalWorkedMinutes,
  workBlocks,
} from "./work-time";

export interface RosterStaff {
  staffName: string;
  week: WeekAvailability;
  employmentType: EmploymentType;
}

export interface TimeWindow {
  start: number; // minutes from midnight of the event's date; may be < 0 or > 1440
  end: number; // always > start
}

export interface Shift {
  eventId: string;
  eventName: string;
  location: string;
  date: string; // the event's date — hours count towards this day, week and fortnight
  staffName: string;
  start: number;
  end: number;
  absStart: number; // minutes since 1970-01-01, for comparing shifts on different days
  absEnd: number;
  hours: number; // worked hours of this shift on its own (unpaid breaks taken out)
  breaks: TimeWindow[]; // unpaid breaks during this shift (see listShifts)
  custom: boolean; // true when this person's times differ from the event's shift
  shared: boolean; // the event lets its staff work other functions at the same time
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// The event itself; an end time at or before the start means it runs past midnight.
export function eventWindow(event: EventRecord): TimeWindow {
  const start = toMinutes(event.startTime);
  let end = toMinutes(event.endTime);
  if (end <= start) end += MINUTES_IN_DAY;
  return { start, end };
}

// What staff work by default: setup before the event and pack-down after it.
export function shiftWindow(event: EventRecord): TimeWindow {
  const { start, end } = eventWindow(event);
  return {
    start: start - Math.round(event.setupHours * 60),
    end: end + Math.round(event.packDownHours * 60),
  };
}

// The copy of `time` (that day, the day before or the day after) closest to `reference`.
function nearest(time: number, reference: number): number {
  return [time - MINUTES_IN_DAY, time, time + MINUTES_IN_DAY].reduce((best, t) =>
    Math.abs(t - reference) < Math.abs(best - reference) ? t : best
  );
}

export function entryWindow(event: EventRecord, entry: RosterEntry): TimeWindow {
  const shift = shiftWindow(event);
  if (!entry.startTime && !entry.endTime) return shift;
  const start = entry.startTime ? nearest(toMinutes(entry.startTime), shift.start) : shift.start;
  let end = entry.endTime ? nearest(toMinutes(entry.endTime), shift.end) : shift.end;
  while (end <= start) end += MINUTES_IN_DAY;
  return { start, end };
}

export function formatWindow({ start, end }: TimeWindow): string {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

// Worked hours of one continuous shift, with its unpaid breaks taken out.
export function windowHours({ start, end }: TimeWindow): number {
  return (end - start - breakOffsets(end - start).length * BREAK_MINUTES) / 60;
}

export function windowBreaks({ start, end }: TimeWindow): TimeWindow[] {
  return breakOffsets(end - start).map((o) => ({ start: start + o, end: start + o + BREAK_MINUTES }));
}

function absolute(date: string, minutes: number): number {
  return dayNumber(date) * MINUTES_IN_DAY + minutes;
}

export function shiftsForEvent(event: EventRecord): Shift[] {
  return event.staff.map((entry) => {
    const window = entryWindow(event, entry);
    return {
      eventId: event.id,
      eventName: event.name,
      location: event.location,
      date: event.date,
      staffName: entry.name,
      start: window.start,
      end: window.end,
      absStart: absolute(event.date, window.start),
      absEnd: absolute(event.date, window.end),
      hours: windowHours(window),
      breaks: windowBreaks(window),
      custom: Boolean(entry.startTime || entry.endTime),
      shared: event.shareStaff,
    };
  });
}

// Every shift, with each person's breaks worked out over their whole stretch
// at work that day: someone on two functions at once (shared staff) gets one
// break between them, not one per function.
export function listShifts(events: EventRecord[]): Shift[] {
  const shifts = events.flatMap(shiftsForEvent);
  const byPersonDay = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = `${s.staffName.trim().toLowerCase()}|${s.date}`;
    byPersonDay.set(key, [...(byPersonDay.get(key) ?? []), s]);
  }
  for (const group of byPersonDay.values()) {
    if (group.length < 2) continue;
    const breaks = workBlocks(group.map((s): Interval => [s.absStart, s.absEnd])).flatMap((b) => b.breaks);
    for (const s of group) {
      const base = s.absStart - s.start;
      s.breaks = breaks
        .filter(([from, to]) => from >= s.absStart && to <= s.absEnd)
        .map(([from, to]) => ({ start: from - base, end: to - base }));
    }
  }
  return shifts;
}

// A person's time at work on one day: continuous stretches (overlapping
// shifts joined), their unpaid breaks, and worked hours.
export function workDay(shifts: Shift[], name: string, date: string) {
  const own = shifts.filter((s) => sameName(s.staffName, name) && s.date === date);
  const base = dayNumber(date) * MINUTES_IN_DAY;
  const blocks = workBlocks(own.map((s): Interval => [s.absStart, s.absEnd]));
  return {
    stretches: blocks.map((b) => ({ start: b.start - base, end: b.end - base })),
    breaks: blocks.flatMap((b) => b.breaks.map(([from, to]) => ({ start: from - base, end: to - base }))),
    hours: blocks.reduce((sum, b) => sum + b.workedMinutes, 0) / 60,
  };
}

export function eventsInRange(events: EventRecord[], from: string, days: number): EventRecord[] {
  const to = addDays(from, days - 1);
  return events
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

// ---------------------------------------------------------------------------
// Staffing: how many people are on at each moment of the shift

// [from, to, people on] for each stretch of `window` where that number is constant.
function headcount(event: EventRecord, window: TimeWindow): [number, number, number][] {
  const entries = event.staff.map((e) => entryWindow(event, e));
  const points = [...new Set([window.start, window.end, ...entries.flatMap((w) => [w.start, w.end])])]
    .filter((t) => t >= window.start && t <= window.end)
    .sort((a, b) => a - b);
  return points.slice(0, -1).map((from, i) => {
    const to = points[i + 1];
    return [from, to, entries.filter((w) => w.start <= from && w.end >= to).length];
  });
}

// Fewest people on at any moment of `window` (default: the whole shift).
export function minCoverage(event: EventRecord, window: TimeWindow = shiftWindow(event)): number {
  const counts = headcount(event, window).map(([, , count]) => count);
  return counts.length > 0 ? Math.min(...counts) : 0;
}

// Times within the shift when fewer people are on than the event needs.
export function shortTimes(event: EventRecord): TimeWindow[] {
  const short: TimeWindow[] = [];
  for (const [from, to, count] of headcount(event, shiftWindow(event))) {
    if (count >= event.staffNeeded) continue;
    const last = short[short.length - 1];
    if (last && last.end === from) last.end = to;
    else short.push({ start: from, end: to });
  }
  return short;
}

// ---------------------------------------------------------------------------
// Availability

export type Coverage = "full" | "partial" | "none";

export interface AvailabilityCheck {
  coverage: Coverage;
  free: TimeWindow | null; // the longest stretch of the window the person is free for
}

// Merged free intervals (absolute minutes) from the day before `date` to the
// day after, so overnight availability ("22:00–06:00") and all-day runs
// across midnight join up.
function freeIntervals(week: WeekAvailability, date: string): [number, number][] {
  const intervals: [number, number][] = [];
  for (let offset = -1; offset <= 1; offset++) {
    const day = addDays(date, offset);
    const base = dayNumber(day) * MINUTES_IN_DAY;
    const availability = week[weekdayOf(day)];
    if (availability.status === "available_all_day") {
      intervals.push([base, base + MINUTES_IN_DAY]);
    } else if (availability.status === "custom") {
      const start = toMinutes(availability.startTime);
      const end = toMinutes(availability.endTime);
      if (end > start) intervals.push([base + start, base + end]);
      else if (end < start) intervals.push([base + start, base + end + MINUTES_IN_DAY]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

export function checkAvailability(
  week: WeekAvailability,
  date: string,
  window: TimeWindow
): AvailabilityCheck {
  const base = dayNumber(date) * MINUTES_IN_DAY;
  const from = base + window.start;
  const to = base + window.end;
  let free: TimeWindow | null = null;
  for (const [s, e] of freeIntervals(week, date)) {
    const start = Math.max(s, from);
    const end = Math.min(e, to);
    if (end > start && (!free || end - start > free.end - free.start)) {
      free = { start: start - base, end: end - base };
    }
  }
  if (!free) return { coverage: "none", free: null };
  const full = free.start === window.start && free.end === window.end;
  return { coverage: full ? "full" : "partial", free };
}

// ---------------------------------------------------------------------------
// Hours and the employment-type rules

interface ExtraShift {
  date: string;
  interval: Interval; // absolute minutes
}

// Worked hours per day for one person, from `from` for `days` days. Shifts on
// the same day that overlap (shared functions) count once; unpaid breaks are
// taken out.
function hoursByDay(
  name: string,
  shifts: Shift[],
  from: string,
  days: number,
  extra?: ExtraShift
): Map<string, number> {
  const to = addDays(from, days - 1);
  const byDay = new Map<string, Interval[]>();
  for (const s of shifts) {
    if (!sameName(s.staffName, name) || s.date < from || s.date > to) continue;
    byDay.set(s.date, [...(byDay.get(s.date) ?? []), [s.absStart, s.absEnd]]);
  }
  if (extra && extra.date >= from && extra.date <= to) {
    byDay.set(extra.date, [...(byDay.get(extra.date) ?? []), extra.interval]);
  }
  return new Map([...byDay].map(([date, intervals]) => [date, totalWorkedMinutes(intervals) / 60]));
}

function hoursFor(name: string, shifts: Shift[], from: string, days: number, extra?: ExtraShift): number {
  return [...hoursByDay(name, shifts, from, days, extra).values()].reduce((sum, h) => sum + h, 0);
}

export interface HoursSummary {
  staffName: string;
  employmentType: EmploymentType;
  onStaffList: boolean;
  week1: number;
  week2: number;
  total: number;
  shiftCount: number;
  warnings: string[];
}

export function ruleWarnings(
  type: EmploymentType,
  week1: number,
  week2: number,
  days: Map<string, number> = new Map()
): string[] {
  const total = week1 + week2;
  const warnings: string[] = [];
  if (type === "student" && total > STUDENT_MAX_FORTNIGHT_HOURS) {
    warnings.push(`Over the ${STUDENT_MAX_FORTNIGHT_HOURS}h student limit`);
  }
  const soft = softFortnightLimit(type);
  if (soft !== null && total > soft) warnings.push(`Over ${soft}h`);
  if (type === "part_time") {
    if (week1 < PART_TIME_MIN_WEEKLY_HOURS) warnings.push(`Week 1 under ${PART_TIME_MIN_WEEKLY_HOURS}h`);
    if (week2 < PART_TIME_MIN_WEEKLY_HOURS) warnings.push(`Week 2 under ${PART_TIME_MIN_WEEKLY_HOURS}h`);
  }
  for (const [date, hours] of [...days].sort()) {
    if (hours > DAILY_MAX_HOURS) {
      warnings.push(`${formatHours(hours)} on ${formatWeekdayDate(date)} (max ${DAILY_MAX_HOURS}h)`);
    }
  }
  return warnings;
}

// One row per staff member (sheet order), plus anyone rostered who is no
// longer on the staff list, so their hours never silently disappear.
export function summarizeHours(
  staff: RosterStaff[],
  shifts: Shift[],
  fortnightStart: string
): HoursSummary[] {
  const fortnightEnd = addDays(fortnightStart, 13);
  const inFortnight = shifts.filter((s) => s.date >= fortnightStart && s.date <= fortnightEnd);
  const people: { staffName: string; employmentType: EmploymentType; onStaffList: boolean }[] =
    staff.map((s) => ({ ...s, onStaffList: true }));
  for (const shift of inFortnight) {
    if (!people.some((p) => sameName(p.staffName, shift.staffName))) {
      people.push({ staffName: shift.staffName, employmentType: "casual", onStaffList: false });
    }
  }

  return people.map((person) => {
    const days = hoursByDay(person.staffName, inFortnight, fortnightStart, 14);
    const week1 = hoursFor(person.staffName, inFortnight, fortnightStart, 7);
    const week2 = hoursFor(person.staffName, inFortnight, addDays(fortnightStart, 7), 7);
    const warnings = ruleWarnings(person.employmentType, week1, week2, days);
    if (!person.onStaffList) warnings.unshift("Not on the staff list");
    return {
      ...person,
      week1,
      week2,
      total: week1 + week2,
      shiftCount: inFortnight.filter((s) => sameName(s.staffName, person.staffName)).length,
      warnings,
    };
  });
}

// ---------------------------------------------------------------------------
// Choosing who works

export interface Candidate {
  staffName: string;
  employmentType: EmploymentType;
  coverage: Coverage;
  free: TimeWindow | null;
  weekHours: number;
  fortnightHours: number;
  sharing: boolean; // already on another function at that time, which is allowed here
  blockers: string[]; // reasons auto-fill will not pick them
  notes: string[]; // things worth knowing before adding them by hand
  priority: number; // lower is picked first
}

// Another of this person's shifts overlapping [absStart, absEnd).
function overlapping(shifts: Shift[], name: string, absStart: number, absEnd: number, eventId: string) {
  return shifts.find(
    (s) =>
      sameName(s.staffName, name) &&
      s.eventId !== eventId &&
      s.absStart < absEnd &&
      absStart < s.absEnd
  );
}

// Everyone not already on `event`, best choice first, for the event's shift
// or a part of it (`target`):
//   1. part-timers still under their weekly minimum,
//   2. full-timers who stay within 76h,
//   3. everyone else (casuals within 76h, students under their limit, part-timers past the minimum),
//   4. full-timers and casuals who would go over 76h — only when no one else can.
// Within groups 1–3, people not working at that time come before people
// shared from another function (who add no extra hours, so they still come
// before group 4). Then whoever has the fewest hours this fortnight goes
// first, so shifts are shared out evenly; ties keep the staff list's order.
export function rankCandidates(
  event: EventRecord,
  staff: RosterStaff[],
  shifts: Shift[],
  fortnightAnchor: string,
  target: TimeWindow = shiftWindow(event)
): Candidate[] {
  const fortnightStart = fortnightStartFor(event.date, fortnightAnchor);
  const weekStart = daysBetween(fortnightStart, event.date) < 7 ? fortnightStart : addDays(fortnightStart, 7);
  const absStart = absolute(event.date, target.start);
  const absEnd = absolute(event.date, target.end);
  const extra: ExtraShift = { date: event.date, interval: [absStart, absEnd] };

  const candidates = staff
    .filter((person) => !event.staff.some((entry) => sameName(entry.name, person.staffName)))
    .map((person, index) => {
      const name = person.staffName;
      const { coverage, free } = checkAvailability(person.week, event.date, target);
      const weekHours = hoursFor(name, shifts, weekStart, 7);
      const fortnightHours = hoursFor(name, shifts, fortnightStart, 14);
      const after = hoursFor(name, shifts, fortnightStart, 14, extra);
      const dayAfter = hoursByDay(name, shifts, event.date, 1, extra).get(event.date) ?? 0;
      const blockers: string[] = [];
      const notes: string[] = [];

      if (coverage === "none") blockers.push("Not available");
      if (coverage === "partial" && free) notes.push(`Only free ${formatWindow(free)}`);
      const clash = overlapping(shifts, name, absStart, absEnd, event.id);
      const sharing = Boolean(clash && (clash.shared || event.shareStaff));
      if (clash && !sharing) {
        blockers.push(`Already on ${clash.eventName} ${formatMinutes(clash.start)}–${formatMinutes(clash.end)}`);
      }
      if (clash && sharing) notes.push(`Also on ${clash.eventName} at the same time (shared)`);
      if (dayAfter > DAILY_MAX_HOURS) {
        blockers.push(`Would work ${formatHours(dayAfter)} that day (max ${DAILY_MAX_HOURS}h)`);
      }
      if (person.employmentType === "student" && after > STUDENT_MAX_FORTNIGHT_HOURS) {
        blockers.push(`Would reach ${formatHours(after)} (student limit ${STUDENT_MAX_FORTNIGHT_HOURS}h)`);
      }
      const soft = softFortnightLimit(person.employmentType);
      const overSoft = soft !== null && after > soft;
      if (overSoft) notes.push(`Would reach ${formatHours(after)} (over ${soft}h)`);

      let priority = 2;
      if (person.employmentType === "part_time" && weekHours < PART_TIME_MIN_WEEKLY_HOURS) priority = 0;
      if (person.employmentType === "full_time" && after <= FULL_TIME_FORTNIGHT_HOURS) priority = 1;
      if (overSoft) priority = 3;

      return {
        candidate: {
          staffName: name,
          employmentType: person.employmentType,
          coverage,
          free,
          weekHours,
          fortnightHours,
          sharing,
          blockers,
          notes,
          priority,
        },
        index,
      };
    });

  const coverageRank: Record<Coverage, number> = { full: 0, partial: 1, none: 2 };
  candidates.sort(
    (a, b) =>
      Number(a.candidate.blockers.length > 0) - Number(b.candidate.blockers.length > 0) ||
      coverageRank[a.candidate.coverage] - coverageRank[b.candidate.coverage] ||
      Number(a.candidate.priority === 3) - Number(b.candidate.priority === 3) ||
      Number(a.candidate.sharing) - Number(b.candidate.sharing) ||
      a.candidate.priority - b.candidate.priority ||
      a.candidate.fortnightHours - b.candidate.fortnightHours ||
      a.index - b.index
  );
  return candidates.map((c) => c.candidate);
}

export interface AutoFillResult {
  events: EventRecord[]; // every event, with the fortnight's events filled
  added: number;
  shortfalls: { eventId: string; eventName: string; date: string; missing: number }[];
}

// Fills open places on the fortnight's events, earliest first, keeping
// everyone already rostered. Only picks people free for the whole shift with
// no blockers, so it never double-books anyone (unless a function shares its
// staff), never goes past 12h in a day and never takes a student past 48h.
// A shift longer than one person may work (12h plus the break) is split into
// equal parts, e.g. an early and a late shift, each filled separately.
// Events before `fromDate` (today) are history and are left as they are,
// though their hours still count.
export function autoFill(
  events: EventRecord[],
  staff: RosterStaff[],
  fortnightStart: string,
  fortnightAnchor: string,
  fromDate = ""
): AutoFillResult {
  const updated = events.map((e) => ({ ...e, staff: [...e.staff] }));
  const shifts = listShifts(updated);
  const shortfalls: AutoFillResult["shortfalls"] = [];
  let added = 0;

  for (const event of eventsInRange(updated, fortnightStart, 14)) {
    if (event.date < fromDate) continue;
    const shift = shiftWindow(event);
    const parts = splitIntoParts(shift.start, shift.end);
    for (const [start, end] of parts) {
      const part = { start, end };
      while (minCoverage(event, part) < event.staffNeeded) {
        const pick = rankCandidates(event, staff, shifts, fortnightAnchor, part).find(
          (c) => c.blockers.length === 0 && c.coverage === "full"
        );
        if (!pick) break;
        const whole = parts.length === 1;
        const entry: RosterEntry = {
          name: pick.staffName,
          startTime: whole ? "" : formatMinutes(start),
          endTime: whole ? "" : formatMinutes(end),
        };
        event.staff.push(entry);
        shifts.push(...shiftsForEvent({ ...event, staff: [entry] }));
        added++;
      }
    }
    const covered = minCoverage(event);
    if (covered < event.staffNeeded) {
      shortfalls.push({
        eventId: event.id,
        eventName: event.name,
        date: event.date,
        missing: event.staffNeeded - covered,
      });
    }
  }

  return { events: updated, added, shortfalls };
}

// Problems with who is already rostered on an event (availability may have
// changed since, or someone was added by hand).
export function rosterIssues(event: EventRecord, staff: RosterStaff[], shifts: Shift[]): string[] {
  const issues: string[] = [];
  for (const shift of shiftsForEvent(event)) {
    const person = staff.find((s) => sameName(s.staffName, shift.staffName));
    if (!person) {
      issues.push(`${shift.staffName} is not on the staff list`);
      continue;
    }
    const { coverage } = checkAvailability(person.week, event.date, shift);
    if (coverage !== "full") {
      issues.push(`${shift.staffName} isn't available for all of ${formatWindow(shift)}`);
    }
    const clash = overlapping(shifts, shift.staffName, shift.absStart, shift.absEnd, event.id);
    if (clash && !clash.shared && !event.shareStaff) {
      issues.push(`${shift.staffName} is also on ${clash.eventName} at the same time`);
    }
    const day = hoursByDay(shift.staffName, shifts, event.date, 1).get(event.date) ?? 0;
    if (day > DAILY_MAX_HOURS) {
      issues.push(`${shift.staffName} works ${formatHours(day)} that day (max ${DAILY_MAX_HOURS}h)`);
    }
  }
  if (event.staff.length >= event.staffNeeded) {
    for (const gap of shortTimes(event)) issues.push(`Fewer than ${event.staffNeeded} on at ${formatWindow(gap)}`);
  }
  return issues;
}
