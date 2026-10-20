// Shifts, tasks, hour rules, eligibility and roster generation. Pure
// functions only (no sheet access), so the admin pages, the API and the tests
// all share exactly the same rules.
//
// Who may work a task is decided in two stages:
//   A. checks every candidate must pass (availability, no clash, current
//      qualifications and skills, work restrictions, hour limits);
//   B. among those who pass, a ranking with a short explanation.
// Generate roster only ever picks people who pass every check; anything it
// can't fill safely is left open with the reasons.

import type { WeekAvailability } from "./availability";
import {
  MINUTES_IN_DAY,
  addDays,
  dayNumber,
  daysBetween,
  formatDayMonth,
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
  type Restriction,
  type ShiftPreference,
  type StaffRequest,
  SHIFT_PREFERENCE_LABELS,
  blockingRestriction,
  describeRestriction,
  matchesPreference,
  restrictionApplies,
  timeOffOn,
} from "./profile";
import { DEFAULT_MATCHING, type MatchingSettings } from "./settings";
import {
  type SkillDef,
  type StaffSkills,
  SKILL_LEVEL_LABELS,
  currentSkill,
  levelRank,
  skillName,
  skillState,
} from "./skills";
import { type EventTask, GENERAL_TASK_ID, generalTask, isSafetyCritical } from "./tasks";
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
  // Profile details; missing means none recorded.
  active?: boolean;
  skills?: StaffSkills;
  restrictions?: Restriction[];
  preferences?: ShiftPreference[];
  requests?: StaffRequest[];
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
  custom: boolean; // true when this person's times differ from the task's
  shared: boolean; // the event lets its staff work other functions at the same time
  taskId: string;
  taskName: string;
  combinable: boolean; // the task may be done alongside another combinable task
  critical: boolean; // heavy work, team lifting or safety controls: never combined
  leadership: boolean;
  published: boolean;
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// The event itself; an end time at or before the start means it runs past midnight.
export function eventWindow(event: Pick<EventRecord, "startTime" | "endTime">): TimeWindow {
  const start = toMinutes(event.startTime);
  let end = toMinutes(event.endTime);
  if (end <= start) end += MINUTES_IN_DAY;
  return { start, end };
}

// The general staff shift: setup before the event and pack-down after it.
export function shiftWindow(event: Pick<EventRecord, "startTime" | "endTime" | "setupHours" | "packDownHours">): TimeWindow {
  const { start, end } = eventWindow(event);
  return {
    start: start - Math.round(event.setupHours * 60),
    end: end + Math.round(event.packDownHours * 60),
  };
}

// The copy of `time` (that day, the day before or the day after) closest to
// `reference`; on a tie, that day's.
function nearest(time: number, reference: number): number {
  return [time, time - MINUTES_IN_DAY, time + MINUTES_IN_DAY].reduce((best, t) =>
    Math.abs(t - reference) < Math.abs(best - reference) ? t : best
  );
}

// The event's tasks; an event saved without tasks has one general task.
export function eventTasks(event: Pick<EventRecord, "tasks" | "staffNeeded">): EventTask[] {
  return event.tasks.length > 0 ? event.tasks : [generalTask(event.staffNeeded)];
}

export function taskOf(event: EventRecord, entry: RosterEntry): EventTask | undefined {
  const id = entry.taskId || GENERAL_TASK_ID;
  return eventTasks(event).find((t) => t.id === id);
}

export function entriesOn(event: EventRecord, task: EventTask): RosterEntry[] {
  return event.staff.filter((e) => (e.taskId || GENERAL_TASK_ID) === task.id);
}

// When a task happens. Its times are on the event's date, or the day either
// side when that is nearer the event (a pack-down at 01:00 after a late event).
export function taskWindow(event: EventRecord, task: EventTask): TimeWindow {
  if (!task.startTime || !task.endTime) return shiftWindow(event);
  const ev = eventWindow(event);
  const start = nearest(toMinutes(task.startTime), (ev.start + ev.end) / 2);
  let end = toMinutes(task.endTime);
  while (end <= start) end += MINUTES_IN_DAY;
  while (end - start > MINUTES_IN_DAY) end -= MINUTES_IN_DAY;
  return { start, end };
}

// From the first task's start to the last task's end.
export function eventSpan(event: EventRecord): TimeWindow {
  const windows = eventTasks(event).map((t) => taskWindow(event, t));
  const ev = eventWindow(event);
  return {
    start: Math.min(ev.start, ...windows.map((w) => w.start)),
    end: Math.max(ev.end, ...windows.map((w) => w.end)),
  };
}

function windowWithin(base: TimeWindow, entry: RosterEntry): TimeWindow {
  if (!entry.startTime && !entry.endTime) return base;
  const start = entry.startTime ? nearest(toMinutes(entry.startTime), base.start) : base.start;
  let end = entry.endTime ? nearest(toMinutes(entry.endTime), base.end) : base.end;
  while (end <= start) end += MINUTES_IN_DAY;
  return { start, end };
}

// One person's times: their own, or the whole of their task.
export function entryWindow(event: EventRecord, entry: RosterEntry): TimeWindow {
  const task = taskOf(event, entry);
  return windowWithin(task ? taskWindow(event, task) : eventSpan(event), entry);
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

function shiftFor(event: EventRecord, entry: RosterEntry): Shift {
  const task = taskOf(event, entry);
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
    taskId: entry.taskId || GENERAL_TASK_ID,
    taskName: task?.name ?? entry.taskId ?? "",
    combinable: task ? task.combinable && !isSafetyCritical(task) : false,
    critical: task ? isSafetyCritical(task) : false,
    leadership: task?.leadership ?? false,
    published: event.status !== "draft",
  };
}

export function shiftsForEvent(event: EventRecord): Shift[] {
  return event.staff.map((entry) => shiftFor(event, entry));
}

// Every shift, with each person's breaks worked out over their whole stretch
// at work that day: someone on two tasks or functions in a row or at once
// gets one break between them, not one per task.
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

export function eventsInRange<T extends Pick<EventRecord, "date" | "startTime">>(events: T[], from: string, days: number): T[] {
  const to = addDays(from, days - 1);
  return events
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

// ---------------------------------------------------------------------------
// Staffing: how many people are on a task at each moment

// [from, to, people on] for each stretch of `window` where that number is
// constant. Each person counts once, however many times they're listed.
function headcount(event: EventRecord, entries: RosterEntry[], window: TimeWindow): [number, number, number][] {
  const spans = entries.map((e) => ({ name: e.name.trim().toLowerCase(), w: entryWindow(event, e) }));
  const points = [...new Set([window.start, window.end, ...spans.flatMap((s) => [s.w.start, s.w.end])])]
    .filter((t) => t >= window.start && t <= window.end)
    .sort((a, b) => a - b);
  return points.slice(0, -1).map((from, i) => {
    const to = points[i + 1];
    return [from, to, new Set(spans.filter((s) => s.w.start <= from && s.w.end >= to).map((s) => s.name)).size];
  });
}

function fewest(counts: [number, number, number][]): number {
  return counts.length > 0 ? Math.min(...counts.map(([, , c]) => c)) : 0;
}

// Fewest people on a task at any moment of `window` (default: the whole task).
export function taskCoverage(
  event: EventRecord,
  task: EventTask,
  window: TimeWindow = taskWindow(event, task),
  entries: RosterEntry[] = entriesOn(event, task)
): number {
  return fewest(headcount(event, entries, window));
}

// Fewest people on at any moment of `window`, for an event's general task.
export function minCoverage(event: EventRecord, window?: TimeWindow): number {
  const task = eventTasks(event)[0];
  return taskCoverage(event, task, window ?? taskWindow(event, task));
}

function lowStretches(counts: [number, number, number][], below: (count: number) => boolean): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const [from, to, count] of counts) {
    if (!below(count)) continue;
    const last = out[out.length - 1];
    if (last && last.end === from) last.end = to;
    else out.push({ start: from, end: to });
  }
  return out;
}

// Times within the general shift when fewer people are on than it needs.
export function shortTimes(event: EventRecord): TimeWindow[] {
  const task = eventTasks(event)[0];
  return lowStretches(headcount(event, entriesOn(event, task), taskWindow(event, task)), (c) => c < task.count);
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

// The calendar dates a window on `date` touches.
function datesOf(date: string, window: TimeWindow): [string, string] {
  return [
    addDays(date, Math.floor(window.start / MINUTES_IN_DAY)),
    addDays(date, Math.floor((window.end - 1) / MINUTES_IN_DAY)),
  ];
}

// ---------------------------------------------------------------------------
// Hours and the employment-type rules

// Each person's shifts, for quick lookups while rostering many positions.
export class ShiftBook {
  private byName = new Map<string, Shift[]>();

  constructor(shifts: Shift[] = []) {
    shifts.forEach((s) => this.add(s));
  }

  private key(name: string) {
    return name.trim().toLowerCase();
  }

  add(shift: Shift) {
    const key = this.key(shift.staffName);
    this.byName.set(key, [...(this.byName.get(key) ?? []), shift]);
  }

  remove(shift: Shift) {
    const key = this.key(shift.staffName);
    this.byName.set(key, (this.byName.get(key) ?? []).filter((s) => s !== shift));
  }

  of(name: string): Shift[] {
    return this.byName.get(this.key(name)) ?? [];
  }

  all(): Shift[] {
    return [...this.byName.values()].flat();
  }
}

// Worked hours per day from `own` shifts (one person's), from `from` for
// `days` days, plus an optional extra interval. Shifts on the same day that
// overlap or touch count once; unpaid breaks are taken out.
function hoursByDay(
  own: Shift[],
  from: string,
  days: number,
  extra?: { date: string; interval: Interval }
): Map<string, number> {
  const to = addDays(from, days - 1);
  const byDay = new Map<string, Interval[]>();
  for (const s of own) {
    if (s.date < from || s.date > to) continue;
    byDay.set(s.date, [...(byDay.get(s.date) ?? []), [s.absStart, s.absEnd]]);
  }
  if (extra && extra.date >= from && extra.date <= to) {
    byDay.set(extra.date, [...(byDay.get(extra.date) ?? []), extra.interval]);
  }
  return new Map([...byDay].map(([date, intervals]) => [date, totalWorkedMinutes(intervals) / 60]));
}

function hoursFor(own: Shift[], from: string, days: number, extra?: { date: string; interval: Interval }): number {
  return [...hoursByDay(own, from, days, extra).values()].reduce((sum, h) => sum + h, 0);
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
  const book = new ShiftBook(inFortnight);
  const people: { staffName: string; employmentType: EmploymentType; onStaffList: boolean; active: boolean }[] =
    staff.map((s) => ({
      staffName: s.staffName,
      employmentType: s.employmentType,
      onStaffList: true,
      active: s.active !== false,
    }));
  for (const shift of inFortnight) {
    if (!people.some((p) => sameName(p.staffName, shift.staffName))) {
      people.push({ staffName: shift.staffName, employmentType: "casual", onStaffList: false, active: true });
    }
  }

  return people
    .filter((p) => p.active || book.of(p.staffName).length > 0)
    .map(({ active: _active, ...person }) => {
      const own = book.of(person.staffName);
      const days = hoursByDay(own, fortnightStart, 14);
      const week1 = hoursFor(own, fortnightStart, 7);
      const week2 = hoursFor(own, addDays(fortnightStart, 7), 7);
      const warnings = ruleWarnings(person.employmentType, week1, week2, days);
      if (!person.onStaffList) warnings.unshift("Not on the staff list");
      return { ...person, week1, week2, total: week1 + week2, shiftCount: own.length, warnings };
    });
}

// ---------------------------------------------------------------------------
// Stage A: the checks everyone must pass

export type ProblemCode =
  | "inactive"
  | "unavailable"
  | "time_off"
  | "clash"
  | "qualification"
  | "skill"
  | "restriction"
  | "daily_max"
  | "student_limit";

export interface Problem {
  code: ProblemCode;
  text: string;
  // Can a manager roster them anyway, giving a reason? Never for safety,
  // legal or authorisation checks (qualifications, restrictions, skills for
  // heavy or team work, double-booking).
  overridable: boolean;
}

export interface RosterContext {
  staff: RosterStaff[];
  book: ShiftBook;
  anchor: string; // any date a pay fortnight starts on
  skills: SkillDef[];
  matching: MatchingSettings;
}

export function buildContext(
  staff: RosterStaff[],
  shifts: Shift[],
  anchor: string,
  options: { skills?: SkillDef[]; matching?: MatchingSettings } = {}
): RosterContext {
  return {
    staff,
    book: new ShiftBook(shifts),
    anchor,
    skills: options.skills ?? [],
    matching: options.matching ?? DEFAULT_MATCHING,
  };
}

interface Assessment {
  coverage: Coverage;
  free: TimeWindow | null;
  problems: Problem[];
  notes: string[];
  sharing: boolean;
  clash: Shift | null;
  weekHours: number;
  fortnightHours: number;
  hoursAfter: number;
  overSoft: boolean;
}

function canOverlap(other: Shift, event: EventRecord, task: EventTask): boolean {
  if (other.eventId === event.id) {
    return other.taskId !== task.id && other.combinable && task.combinable && !isSafetyCritical(task);
  }
  return (other.shared || event.shareStaff) && !other.critical && !isSafetyCritical(task);
}

const levelName = (level: string) => SKILL_LEVEL_LABELS[level as keyof typeof SKILL_LEVEL_LABELS] ?? level;

// Every check for `person` working `task` at `window`. `ignore` is the
// person's own shift being re-checked, so it doesn't clash with itself.
function assess(
  event: EventRecord,
  task: EventTask,
  person: RosterStaff,
  window: TimeWindow,
  ctx: RosterContext,
  ignore?: Shift
): Assessment {
  const name = person.staffName;
  const own = ctx.book.of(name).filter((s) => s !== ignore);
  const fortnightStart = fortnightStartFor(event.date, ctx.anchor);
  const weekStart = daysBetween(fortnightStart, event.date) < 7 ? fortnightStart : addDays(fortnightStart, 7);
  const absStart = absolute(event.date, window.start);
  const absEnd = absolute(event.date, window.end);
  const extra = { date: event.date, interval: [absStart, absEnd] as Interval };
  const problems: Problem[] = [];
  const notes: string[] = [];
  const add = (code: ProblemCode, text: string, overridable: boolean) => problems.push({ code, text, overridable });

  if (person.active === false) add("inactive", "Marked inactive", false);

  const { coverage, free } = checkAvailability(person.week, event.date, window);
  if (coverage === "none") add("unavailable", "Not available", true);
  if (coverage === "partial" && free) notes.push(`Only free ${formatWindow(free)}`);
  const [firstDay, lastDay] = datesOf(event.date, window);
  const timeOff = timeOffOn(person.requests ?? [], firstDay, lastDay);
  if (timeOff) {
    const when = timeOff.from === timeOff.to ? formatDayMonth(timeOff.from) : `${formatDayMonth(timeOff.from)}–${formatDayMonth(timeOff.to)}`;
    add("time_off", timeOff.status === "approved" ? `On approved leave ${when}` : `Asked for time off ${when}`, true);
  }

  let clash: Shift | null = null;
  let sharing = false;
  for (const s of own) {
    if (s.absStart >= absEnd || absStart >= s.absEnd) continue;
    if (s.eventId === event.id && s.taskId === task.id) {
      clash = s;
      add("clash", `Already on ${task.name} ${formatWindow(s)}`, false);
      break;
    }
    if (canOverlap(s, event, task)) {
      sharing = true;
      continue;
    }
    clash = s;
    const where = s.eventId === event.id ? s.taskName : s.eventName;
    add("clash", `Already on ${where} ${formatMinutes(s.start)}–${formatMinutes(s.end)}`, false);
    break;
  }
  if (!clash && sharing) {
    const other = own.find((s) => s.absStart < absEnd && absStart < s.absEnd)!;
    notes.push(`Also on ${other.eventId === event.id ? other.taskName : other.eventName} at the same time (shared)`);
  }

  const dayAfter = hoursByDay(own, event.date, 1, extra).get(event.date) ?? 0;
  if (dayAfter > DAILY_MAX_HOURS) {
    add("daily_max", `Would work ${formatHours(dayAfter)} that day (max ${DAILY_MAX_HOURS}h)`, true);
  }
  const weekHours = hoursFor(own, weekStart, 7);
  const fortnightHours = hoursFor(own, fortnightStart, 14);
  const after = hoursFor(own, fortnightStart, 14, extra);
  if (person.employmentType === "student" && after > STUDENT_MAX_FORTNIGHT_HOURS) {
    add("student_limit", `Would reach ${formatHours(after)} (student limit ${STUDENT_MAX_FORTNIGHT_HOURS}h)`, true);
  }
  const soft = softFortnightLimit(person.employmentType);
  const overSoft = soft !== null && after > soft;
  if (overSoft) notes.push(`Would reach ${formatHours(after)} (over ${soft}h)`);

  for (const id of task.qualificationIds) {
    const state = skillState(person.skills?.[id], "learning", event.date);
    if (state.ok) continue;
    const label = skillName(ctx.skills, id);
    add("qualification", state.reason === "expired" ? `${label} expired ${state.expiresOn}` : `No ${label} on file`, false);
  }

  if (task.skillId && task.minLevel) {
    const state = skillState(person.skills?.[task.skillId], task.minLevel, event.date);
    if (!state.ok) {
      const label = skillName(ctx.skills, task.skillId);
      const needs = `needs ${levelName(task.minLevel)}`;
      const text =
        state.reason === "missing"
          ? `${label} not verified (${needs})`
          : state.reason === "expired"
            ? `${label} check due since ${state.expiresOn} (${needs})`
            : `${label}: ${levelName(state.level!)} (${needs})`;
      add("skill", text, !isSafetyCritical(task));
    }
  }

  const restriction = blockingRestriction(person.restrictions ?? [], task.demand, event.date);
  if (restriction) add("restriction", `Work restriction: ${describeRestriction(restriction)}`, false);
  for (const r of person.restrictions ?? []) {
    if (r.type === "note" && restrictionApplies(r, event.date)) notes.push(`Check restriction: ${describeRestriction(r)}`);
  }

  return { coverage, free, problems, notes, sharing, clash, weekHours, fortnightHours, hoursAfter: after, overSoft };
}

// ---------------------------------------------------------------------------
// Stage B: ranking people who pass

export interface Candidate {
  staffName: string;
  employmentType: EmploymentType;
  coverage: Coverage;
  free: TimeWindow | null;
  weekHours: number;
  fortnightHours: number;
  sharing: boolean; // already on another function at that time, which is allowed here
  problems: Problem[];
  blockers: string[]; // the problems' texts: reasons Generate will not pick them
  notes: string[]; // things worth knowing before adding them by hand
  reasons: string[]; // why they're a good fit, best first
  priority: number; // contract group: lower is picked first
  fit: number; // skill, preference and continuity points: higher first
}

function contractPriority(person: RosterStaff, a: Assessment): number {
  let priority = 2;
  if (person.employmentType === "part_time" && a.weekHours < PART_TIME_MIN_WEEKLY_HOURS) priority = 0;
  if (person.employmentType === "full_time" && a.hoursAfter <= FULL_TIME_FORTNIGHT_HOURS) priority = 1;
  if (a.overSoft) priority = 3;
  return priority;
}

function fitFor(
  event: EventRecord,
  task: EventTask,
  person: RosterStaff,
  window: TimeWindow,
  ctx: RosterContext
): { fit: number; reasons: string[] } {
  let fit = 0;
  const reasons: string[] = [];
  if (task.skillId) {
    const record = currentSkill(person.skills?.[task.skillId], event.date);
    if (record) {
      const label = skillName(ctx.skills, task.skillId);
      if (levelRank(record.level) >= levelRank("experienced")) {
        if (ctx.matching.preferExperienced) fit++;
        reasons.push(`${record.level === "qualified" ? "Qualified" : "Experienced"}: ${label}`);
      } else {
        reasons.push(`${levelName(record.level)}: ${label}`);
      }
    }
  }
  const liked = (person.preferences ?? []).filter((p) => matchesPreference(p, event.date, window.start, window.end));
  if (liked.length > 0) {
    if (ctx.matching.usePreferences) fit++;
    reasons.push(`Prefers ${liked.map((p) => SHIFT_PREFERENCE_LABELS[p].toLowerCase()).join(" and ")}`);
  }
  const absStart = absolute(event.date, window.start);
  const absEnd = absolute(event.date, window.end);
  const nearby = ctx.book
    .of(person.staffName)
    .find((s) => s.eventId === event.id && s.absStart <= absEnd + 60 && s.absEnd >= absStart - 60);
  if (nearby) {
    if (ctx.matching.keepTogether) fit++;
    reasons.push(`Already on this event (${nearby.taskName} ${formatWindow(nearby)})`);
  }
  return { fit, reasons };
}

function contractReason(person: RosterStaff, a: Assessment): string {
  if (person.employmentType === "part_time" && a.weekHours < PART_TIME_MIN_WEEKLY_HOURS) {
    return `Part-time, ${formatHours(a.weekHours)} of their ${PART_TIME_MIN_WEEKLY_HOURS}h this week`;
  }
  if (person.employmentType === "full_time" && !a.overSoft) {
    return `Full-time, ${formatHours(a.fortnightHours)} of ${FULL_TIME_FORTNIGHT_HOURS}h this fortnight`;
  }
  const soft = softFortnightLimit(person.employmentType);
  const limit = person.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : soft;
  return limit !== null && !a.overSoft
    ? `${formatHours(a.fortnightHours)} this fortnight, under ${limit}h`
    : `${formatHours(a.fortnightHours)} this fortnight`;
}

function candidateFor(
  event: EventRecord,
  task: EventTask,
  person: RosterStaff,
  target: TimeWindow,
  ctx: RosterContext
): Candidate {
  const a = assess(event, task, person, target, ctx);
  const { fit, reasons } = fitFor(event, task, person, target, ctx);
  const allReasons = [...reasons];
  if (a.coverage === "full") allReasons.push("Available for the whole shift");
  allReasons.push(contractReason(person, a));
  return {
    staffName: person.staffName,
    employmentType: person.employmentType,
    coverage: a.coverage,
    free: a.free,
    weekHours: a.weekHours,
    fortnightHours: a.fortnightHours,
    sharing: a.sharing,
    problems: a.problems,
    blockers: a.problems.map((p) => p.text),
    notes: a.notes,
    reasons: allReasons,
    priority: contractPriority(person, a),
    fit,
  };
}

const coverageRank: Record<Coverage, number> = { full: 0, partial: 1, none: 2 };

// Everyone not already on the task, best choice first, for the task (or a
// part of it, `target`):
//   1. part-timers still under their weekly minimum,
//   2. full-timers who stay within 76h,
//   3. everyone else (casuals within 76h, students under their limit, part-timers past the minimum),
//   4. full-timers and casuals who would go over 76h — only when no one else can.
// Within groups 1–3, people not working at that time come before people
// shared from another function (who add no extra hours, so they still come
// before group 4). Then people with more fit points (experienced in the
// task's skill, prefer this kind of shift, already on the event), then whoever
// has the fewest hours this fortnight, so shifts are shared out evenly; ties
// keep the staff list's order. Anyone failing a check comes last.
export function rankForTask(
  event: EventRecord,
  task: EventTask,
  target: TimeWindow,
  ctx: RosterContext
): Candidate[] {
  const onTask = entriesOn(event, task);
  const candidates = ctx.staff
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => person.active !== false && !onTask.some((e) => sameName(e.name, person.staffName)))
    .map(({ person, index }) => ({ candidate: candidateFor(event, task, person, target, ctx), index }));

  candidates.sort(
    (a, b) =>
      Number(a.candidate.blockers.length > 0) - Number(b.candidate.blockers.length > 0) ||
      coverageRank[a.candidate.coverage] - coverageRank[b.candidate.coverage] ||
      Number(a.candidate.priority === 3) - Number(b.candidate.priority === 3) ||
      Number(a.candidate.sharing) - Number(b.candidate.sharing) ||
      a.candidate.priority - b.candidate.priority ||
      b.candidate.fit - a.candidate.fit ||
      a.candidate.fortnightHours - b.candidate.fortnightHours ||
      a.index - b.index
  );
  return candidates.map((c) => c.candidate);
}

// The original signature: candidates for an event's first (general) task.
export function rankCandidates(
  event: EventRecord,
  staff: RosterStaff[],
  shifts: Shift[],
  fortnightAnchor: string,
  target?: TimeWindow
): Candidate[] {
  const task = eventTasks(event)[0];
  return rankForTask(event, task, target ?? taskWindow(event, task), buildContext(staff, shifts, fortnightAnchor));
}

export function recommendation(c: Candidate): string {
  return `Recommended: ${c.reasons.slice(0, 3).join("; ")}`;
}

// ---------------------------------------------------------------------------
// Checking who is already rostered

export interface EntryCheck {
  entry: RosterEntry;
  window: TimeWindow;
  problems: Problem[];
  notes: string[];
  counts: boolean; // counts towards the task's staffing
  onStaffList: boolean;
}

// Problems with someone already on a task (availability may have changed
// since, or they were added by hand). They count towards staffing unless a
// check fails that can't be overridden, or one that can but has no reason
// recorded.
export function checkEntry(event: EventRecord, entry: RosterEntry, ctx: RosterContext): EntryCheck {
  const window = entryWindow(event, entry);
  const task = taskOf(event, entry);
  const person = ctx.staff.find((s) => sameName(s.staffName, entry.name));
  if (!person || !task) {
    return { entry, window, problems: [], notes: [], counts: Boolean(task), onStaffList: Boolean(person) };
  }
  const self = ctx.book.of(entry.name).find((s) => s.eventId === event.id && s.taskId === task.id && s.start === window.start && s.end === window.end);
  const a = assess(event, task, person, window, ctx, self);
  const problems = a.coverage === "partial"
    ? [{ code: "unavailable" as const, text: `Isn't available for all of ${formatWindow(window)}`, overridable: true }, ...a.problems]
    : a.problems.map((p) => (p.code === "unavailable" ? { ...p, text: `Isn't available for all of ${formatWindow(window)}` } : p));
  const counts = problems.every((p) => p.overridable && Boolean(entry.override));
  return { entry, window, problems, notes: a.notes, counts, onStaffList: true };
}

export interface TaskStatus {
  task: EventTask;
  window: TimeWindow;
  parts: TimeWindow[]; // shifts it's rostered in (early/late when longer than one person may work)
  entries: EntryCheck[];
  covered: number; // fewest people on at once who pass every check
  people: number; // different people on it
  short: TimeWindow[]; // times with fewer than needed (counting only people who pass every check)
  gaps: TimeWindow[]; // times with fewer people listed than needed, whoever they are
  unsafe: TimeWindow[]; // times with someone on a team task but fewer than the team size
  needsControls: boolean; // safety controls not yet confirmed
  needsSupervisor: TimeWindow[]; // times with no supervisor on the event
  filled: boolean;
}

export function taskStatuses(event: EventRecord, ctx: RosterContext): TaskStatus[] {
  const tasks = eventTasks(event);
  const checks = event.staff.map((e) => checkEntry(event, e, ctx));
  const leaders = checks.filter((c) => c.counts && taskOf(event, c.entry)?.leadership).map((c) => c.entry);
  return tasks.map((task) => {
    const window = taskWindow(event, task);
    const entries = checks.filter((c) => (c.entry.taskId || GENERAL_TASK_ID) === task.id);
    const counting = entries.filter((c) => c.counts).map((c) => c.entry);
    const counts = headcount(event, counting, window);
    const raw = headcount(event, entries.map((c) => c.entry), window);
    const covered = fewest(counts);
    const short = task.count > 0 ? lowStretches(counts, (c) => c < task.count) : [];
    const gaps = task.count > 0 ? lowStretches(raw, (c) => c < task.count) : [];
    const unsafe = task.minTeam > 1 ? lowStretches(raw, (c) => c > 0 && c < task.minTeam) : [];
    const needsControls = task.controls !== "" && !task.controlsConfirmed && task.count > 0;
    const needsSupervisor =
      task.needsSupervisor && task.count > 0 ? lowStretches(headcount(event, leaders, window), (c) => c < 1) : [];
    return {
      task,
      window,
      parts: splitIntoParts(window.start, window.end).map(([start, end]) => ({ start, end })),
      entries,
      covered,
      people: new Set(entries.map((c) => c.entry.name.toLowerCase())).size,
      short,
      gaps,
      unsafe,
      needsControls,
      needsSupervisor,
      filled: covered >= task.count && unsafe.length === 0 && !needsControls,
    };
  });
}

export interface EventStaffing {
  filled: number; // positions filled (each task counted up to what it needs)
  needed: number; // positions on mandatory tasks
  optionalOpen: number; // open positions on optional tasks
  people: number; // different people working the event
  complete: boolean; // every mandatory task filled and safe
  warnings: number; // tasks or people with something to sort out
}

export function eventStaffing(event: EventRecord, statuses: TaskStatus[]): EventStaffing {
  const mandatory = statuses.filter((s) => s.task.mandatory);
  const optional = statuses.filter((s) => !s.task.mandatory);
  return {
    filled: mandatory.reduce((sum, s) => sum + Math.min(s.covered, s.task.count), 0),
    needed: mandatory.reduce((sum, s) => sum + s.task.count, 0),
    optionalOpen: optional.reduce((sum, s) => sum + Math.max(0, s.task.count - s.covered), 0),
    people: new Set(event.staff.map((e) => e.name.toLowerCase())).size,
    complete: mandatory.every((s) => s.filled),
    warnings: statuses.reduce(
      (sum, s) =>
        sum +
        s.entries.filter((c) => !c.counts || !c.onStaffList).length +
        (s.unsafe.length > 0 ? 1 : 0) +
        (s.needsControls ? 1 : 0) +
        (s.needsSupervisor.length > 0 ? 1 : 0),
      0
    ),
  };
}

export interface Issue {
  severity: "warning" | "info";
  text: string;
  taskId?: string;
  staffName?: string;
}

const isGeneral = (task: EventTask) => task.id === GENERAL_TASK_ID && task.typeId === "";

// Everything to sort out on an event, worst first.
export function eventIssues(event: EventRecord, statuses: TaskStatus[]): Issue[] {
  const warnings: Issue[] = [];
  const infos: Issue[] = [];
  for (const s of statuses) {
    const on = isGeneral(s.task) ? "" : ` ${s.task.name}`;
    for (const c of s.entries) {
      const who = c.entry.name;
      if (!c.onStaffList) warnings.push({ severity: "warning", text: `${who} is not on the staff list`, staffName: who });
      for (const p of c.problems) {
        const text = p.code === "unavailable" ? `${who} isn't available for all of ${formatWindow(c.window)}` : clashText(who, p);
        if (p.overridable && c.entry.override) {
          infos.push({ severity: "info", text: `${text} — rostered anyway: “${c.entry.override}”`, taskId: s.task.id, staffName: who });
        } else {
          warnings.push({ severity: "warning", text: p.overridable ? text : `${text} — can't work${on || " this"}`, taskId: s.task.id, staffName: who });
        }
      }
    }
    if (s.needsControls) {
      warnings.push({ severity: "warning", text: `${s.task.name}: confirm the safety controls are in place (${s.task.controls})`, taskId: s.task.id });
    }
    for (const gap of s.unsafe) {
      warnings.push({ severity: "warning", text: `${s.task.name} is done as a team of ${s.task.minTeam} — not enough people on at ${formatWindow(gap)}`, taskId: s.task.id });
    }
    for (const gap of s.needsSupervisor) {
      warnings.push({ severity: "warning", text: `${s.task.name} needs a supervisor or team leader on the event at ${formatWindow(gap)}`, taskId: s.task.id });
    }
    // When enough people are listed but their times leave a gap (the
    // staffing count shows the rest).
    if (s.people >= s.task.count && s.task.count > 0) {
      for (const gap of s.gaps) {
        warnings.push({ severity: "warning", text: `Fewer than ${s.task.count} on${on} at ${formatWindow(gap)}`, taskId: s.task.id });
      }
    }
  }
  return [...warnings, ...infos];
}

function clashText(who: string, p: Problem): string {
  if (p.code === "clash") return `${who} is also on ${p.text.replace(/^Already on /, "").replace(/ \d\d:\d\d–\d\d:\d\d$/, "")} at the same time`;
  if (p.code === "daily_max") return `${who} works ${p.text.replace(/^Would work /, "")}`;
  return `${who}: ${p.text}`;
}

// The original signature: issue texts for an event.
export function rosterIssues(event: EventRecord, staff: RosterStaff[], shifts: Shift[], anchor = "2026-01-05"): string[] {
  const ctx = buildContext(staff, shifts, anchor);
  return eventIssues(event, taskStatuses(event, ctx)).map((i) => i.text);
}

// ---------------------------------------------------------------------------
// Why a position is open

export interface GapReason {
  code: ProblemCode | "partial" | "team" | "eligible";
  label: string;
  count: number;
}

const GAP_LABELS: Record<GapReason["code"], string> = {
  unavailable: "not available",
  time_off: "on leave or asked for time off",
  clash: "already working at that time",
  qualification: "missing or expired qualification",
  skill: "skill not verified",
  restriction: "work restriction",
  daily_max: "would pass a working-hour limit",
  student_limit: "would pass a working-hour limit",
  inactive: "inactive",
  partial: "only free for part of it",
  team: "not enough eligible people for a safe team",
  eligible: "eligible — can be added",
};

// Each person's main reason they can't take an open place, counted. People
// who could take it are counted too — as too few for a safe team when the
// task is team work and there aren't enough of them.
export function explainOpenPlace(event: EventRecord, task: EventTask, window: TimeWindow, ctx: RosterContext): GapReason[] {
  const counts = new Map<GapReason["code"], number>();
  for (const c of rankForTask(event, task, window, ctx)) {
    const code: GapReason["code"] = c.problems[0]?.code ?? (c.coverage === "full" ? "eligible" : "partial");
    const key = code === "student_limit" ? "daily_max" : code;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const eligible = counts.get("eligible") ?? 0;
  const onTask = taskCoverage(event, task, window);
  if (task.minTeam > 1 && eligible > 0 && onTask + eligible < task.minTeam) {
    counts.delete("eligible");
    counts.set("team", eligible);
  }
  return [...counts]
    .map(([code, count]) => ({
      code,
      label: code === "team" ? `eligible, but fewer than a team of ${task.minTeam}` : GAP_LABELS[code],
      count,
    }))
    .sort((a, b) => Number(a.code === "eligible") - Number(b.code === "eligible") || b.count - a.count);
}

// ---------------------------------------------------------------------------
// Generate roster: a draft for the manager to review

export interface Proposal {
  eventId: string;
  eventName: string;
  date: string;
  taskId: string;
  taskName: string;
  staffName: string;
  startTime: string; // "" = the whole task
  endTime: string;
  window: TimeWindow;
  reason: string;
}

export interface Gap {
  eventId: string;
  eventName: string;
  date: string;
  taskId: string;
  taskName: string;
  missing: number;
  short: TimeWindow[];
  reasons: GapReason[];
  note: string; // e.g. safety controls not confirmed
}

export interface GenerateResult {
  events: EventRecord[]; // every event, with the proposals added
  proposals: Proposal[];
  gaps: Gap[];
  added: number;
  shortfalls: { eventId: string; eventName: string; date: string; missing: number }[];
}

interface OpenPart {
  event: EventRecord;
  task: EventTask;
  part: TimeWindow;
  whole: boolean;
  slack: number;
  order: number;
}

// Proposes people for every open place on the fortnight's events from
// `fromDate` (today) on, keeping everyone already rostered:
//   1. lists every open task (a task longer than one person may work — 12h
//      plus the break — is split into equal early and late parts);
//   2. fills the most constrained first: mandatory before optional, then the
//      fewest people who could do it compared with how many it needs, then
//      date order;
//   3. picks only people who pass every check and are free for the whole
//      part, best ranked first (see rankForTask);
//   4. a team task (e.g. a team lift of 2) gets a whole team or nobody;
//   5. tasks whose safety controls aren't confirmed are left for the manager;
//   6. reports every place still open, with the reasons.
// Events before `fromDate` are history and are left as they are, though
// their hours still count. Nothing is saved: the result is a draft.
export function generateRoster(
  events: EventRecord[],
  staff: RosterStaff[],
  fortnightStart: string,
  fortnightAnchor: string,
  fromDate = "",
  options: { skills?: SkillDef[]; matching?: MatchingSettings } = {}
): GenerateResult {
  const updated = events.map((e) => ({ ...e, staff: [...e.staff] }));
  const ctx = buildContext(staff, listShifts(updated), fortnightAnchor, options);
  const inRange = eventsInRange(updated, fortnightStart, 14).filter((e) => e.date >= fromDate);
  const proposals: Proposal[] = [];
  const skipped = new Map<string, string>(); // event|task → why it wasn't filled

  const covered = (event: EventRecord, task: EventTask, part: TimeWindow) =>
    taskCoverage(
      event,
      task,
      part,
      entriesOn(event, task).filter((e) => checkEntry(event, e, ctx).counts)
    );

  const open: OpenPart[] = [];
  for (const event of inRange) {
    for (const task of eventTasks(event)) {
      if (task.count === 0) continue;
      if (task.controls && !task.controlsConfirmed) {
        skipped.set(`${event.id}|${task.id}`, `Not filled until the safety controls are confirmed: ${task.controls}`);
        continue;
      }
      const window = taskWindow(event, task);
      const parts = splitIntoParts(window.start, window.end);
      for (const [start, end] of parts) {
        const part = { start, end };
        const need = task.count - covered(event, task, part);
        if (need <= 0) continue;
        const able = rankForTask(event, task, part, ctx).filter(
          (c) => c.coverage === "full" && !c.problems.some((p) => p.code !== "clash" && p.code !== "daily_max" && p.code !== "student_limit")
        ).length;
        open.push({ event, task, part, whole: parts.length === 1, slack: able - need, order: open.length });
      }
    }
  }
  open.sort(
    (a, b) =>
      Number(!a.task.mandatory) - Number(!b.task.mandatory) ||
      a.slack - b.slack ||
      a.order - b.order
  );

  for (const { event, task, part, whole } of open) {
    const picks: { entry: RosterEntry; shift: Shift; candidate: Candidate }[] = [];
    while (covered(event, task, part) < task.count) {
      const pick = rankForTask(event, task, part, ctx).find((c) => c.blockers.length === 0 && c.coverage === "full");
      if (!pick) break;
      const entry: RosterEntry = {
        name: pick.staffName,
        startTime: whole ? "" : formatMinutes(part.start),
        endTime: whole ? "" : formatMinutes(part.end),
        ...(task.id !== GENERAL_TASK_ID ? { taskId: task.id } : {}),
      };
      event.staff.push(entry);
      const shift = shiftFor(event, entry);
      ctx.book.add(shift);
      picks.push({ entry, shift, candidate: pick });
    }
    // A team task with fewer than a full team on it isn't safe: take the
    // picks back off and leave it open.
    const after = covered(event, task, part);
    if (task.minTeam > 1 && after > 0 && after < task.minTeam && picks.length > 0) {
      for (const p of picks) {
        event.staff.splice(event.staff.indexOf(p.entry), 1);
        ctx.book.remove(p.shift);
      }
      skipped.set(`${event.id}|${task.id}`, `Done as a team of ${task.minTeam}: not enough eligible people at the same time`);
      continue;
    }
    for (const p of picks) {
      proposals.push({
        eventId: event.id,
        eventName: event.name,
        date: event.date,
        taskId: task.id,
        taskName: task.name,
        staffName: p.entry.name,
        startTime: p.entry.startTime,
        endTime: p.entry.endTime,
        window: { start: p.shift.start, end: p.shift.end },
        reason: recommendation(p.candidate),
      });
    }
  }

  const gaps: Gap[] = [];
  const shortfalls: GenerateResult["shortfalls"] = [];
  for (const event of inRange) {
    let missing = 0;
    for (const status of taskStatuses(event, ctx)) {
      const { task } = status;
      const gap = Math.max(0, task.count - status.covered);
      if (gap === 0 && status.unsafe.length === 0) continue;
      if (task.mandatory) missing += gap;
      const firstShort = status.short[0] ?? status.window;
      gaps.push({
        eventId: event.id,
        eventName: event.name,
        date: event.date,
        taskId: task.id,
        taskName: task.name,
        missing: gap,
        short: status.short,
        reasons: explainOpenPlace(event, task, firstShort, ctx),
        note: skipped.get(`${event.id}|${task.id}`) ?? "",
      });
    }
    if (missing > 0) shortfalls.push({ eventId: event.id, eventName: event.name, date: event.date, missing });
  }

  return { events: updated, proposals, gaps, added: proposals.length, shortfalls };
}

// Generate and accept every proposal at once (the original Auto-fill).
export function autoFill(
  events: EventRecord[],
  staff: RosterStaff[],
  fortnightStart: string,
  fortnightAnchor: string,
  fromDate = ""
): GenerateResult {
  return generateRoster(events, staff, fortnightStart, fortnightAnchor, fromDate);
}

// ---------------------------------------------------------------------------
// Checking a manager's own changes

// Problems with entries that are new or changed compared with `before`.
// Returns the first change that can't be accepted, or null if all can.
export function checkRosterChange(
  event: EventRecord,
  before: RosterEntry[],
  ctx: RosterContext
): string | null {
  const key = (e: RosterEntry) => `${e.name.toLowerCase()}|${e.taskId ?? ""}|${e.startTime}|${e.endTime}`;
  const tasks = eventTasks(event);
  for (const entry of event.staff) {
    if (before.some((b) => key(b) === key(entry))) continue;
    const task = tasks.find((t) => t.id === (entry.taskId || GENERAL_TASK_ID));
    if (!task) return `${entry.name}: that task isn't on this event any more`;
    const person = ctx.staff.find((s) => sameName(s.staffName, entry.name));
    if (!person) return `${entry.name} is not on the staff list`;
    const check = checkEntry(event, entry, ctx);
    const hard = check.problems.find((p) => !p.overridable);
    if (hard) return `${entry.name} can't work ${task.name}: ${hard.text}`;
    const soft = check.problems.find((p) => p.overridable);
    if (soft && !entry.override) return `${entry.name}: ${soft.text}. Give a reason to roster them anyway.`;
  }
  return null;
}

// Re-checks proposals from a draft against the roster as it is now, adding
// those that still pass. A team task's proposals are added together or not
// at all. Returns the updated events and what was skipped, with the reason.
export function applyProposals(
  events: EventRecord[],
  proposals: Pick<Proposal, "eventId" | "taskId" | "staffName" | "startTime" | "endTime">[],
  staff: RosterStaff[],
  anchor: string,
  options: { skills?: SkillDef[]; matching?: MatchingSettings } = {}
): { events: EventRecord[]; applied: number; skipped: { staffName: string; eventName: string; reason: string }[] } {
  const updated = events.map((e) => ({ ...e, staff: [...e.staff] }));
  const ctx = buildContext(staff, listShifts(updated), anchor, options);
  const skipped: { staffName: string; eventName: string; reason: string }[] = [];
  let applied = 0;

  const groups = new Map<string, typeof proposals>();
  for (const p of proposals) {
    const key = `${p.eventId}|${p.taskId || GENERAL_TASK_ID}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  for (const group of groups.values()) {
    const event = updated.find((e) => e.id === group[0].eventId);
    const task = event && eventTasks(event).find((t) => t.id === (group[0].taskId || GENERAL_TASK_ID));
    if (!event || !task) {
      group.forEach((p) => skipped.push({ staffName: p.staffName, eventName: event?.name ?? "an event", reason: "The event or task was changed" }));
      continue;
    }
    const counting = () => entriesOn(event, task).filter((e) => checkEntry(event, e, ctx).counts);
    const before = taskCoverage(event, task, taskWindow(event, task), counting());
    const added: { entry: RosterEntry; shift: Shift; staffName: string }[] = [];
    for (const p of group) {
      const entry: RosterEntry = {
        name: p.staffName,
        startTime: p.startTime,
        endTime: p.endTime,
        ...(task.id !== GENERAL_TASK_ID ? { taskId: task.id } : {}),
      };
      const person = staff.find((s) => sameName(s.staffName, p.staffName));
      const window = entryWindow(event, entry);
      const a = person ? assess(event, task, person, window, ctx) : null;
      const reason = !person
        ? "Not on the staff list"
        : entriesOn(event, task).some((e) => sameName(e.name, p.staffName))
          ? "Already on this task"
          : taskCoverage(event, task, window, counting()) >= task.count
            ? "The task is already filled"
            : a!.coverage !== "full"
              ? "No longer available for the whole shift"
              : a!.problems[0]?.text;
      if (reason) {
        skipped.push({ staffName: p.staffName, eventName: event.name, reason });
        continue;
      }
      event.staff.push(entry);
      const shift = shiftFor(event, entry);
      ctx.book.add(shift);
      added.push({ entry, shift, staffName: p.staffName });
    }
    const after = taskCoverage(event, task, taskWindow(event, task), counting());
    if (task.minTeam > 1 && before < task.minTeam && after > before && after < task.minTeam) {
      for (const a of added) {
        event.staff.splice(event.staff.indexOf(a.entry), 1);
        ctx.book.remove(a.shift);
        skipped.push({ staffName: a.staffName, eventName: event.name, reason: `${task.name} needs a team of ${task.minTeam} together` });
      }
      continue;
    }
    applied += added.length;
  }
  return { events: updated, applied, skipped };
}

// Takes everyone who isn't locked off the events from `from` to `to`
// (inclusive). Locked people stay, and so does every event's history before `from`.
export function clearUnlocked(
  events: EventRecord[],
  from: string,
  to: string
): { events: EventRecord[]; cleared: number; kept: number } {
  let cleared = 0;
  let kept = 0;
  const updated = events.map((e) => {
    if (e.date < from || e.date > to || e.staff.length === 0) return e;
    const staff = e.staff.filter((s) => s.locked);
    cleared += e.staff.length - staff.length;
    kept += staff.length;
    return staff.length === e.staff.length ? e : { ...e, staff };
  });
  return { events: updated, cleared, kept };
}
