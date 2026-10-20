import { DAYS, type Day } from "./availability";

export { TIME_PATTERN } from "./availability";

// Calendar dates are plain "YYYY-MM-DD" strings (a Melbourne local date, no
// time zone attached). All arithmetic below is done in UTC so it never shifts
// by a day around daylight-saving changes.

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MINUTES_IN_DAY = 1440;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  return DATE_PATTERN.test(date) && fromUtc(toUtc(date)) === date;
}

// Accepts "YYYY-MM-DD", or "D/M/YYYY" as Google Sheets shows a date someone
// typed straight into the sheet (Australian order). Returns "" if unreadable.
export function normalizeDate(input: string): string {
  const value = input.trim();
  if (isValidDate(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const date = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    if (isValidDate(date)) return date;
  }
  return "";
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

// Whole days since 1970-01-01 — used to put dates and times on one timeline.
export function dayNumber(date: string): number {
  return Math.round(toUtc(date).getTime() / 86_400_000);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function weekdayOf(date: string): Day {
  return DAYS[(toUtc(date).getUTCDay() + 6) % 7]; // getUTCDay: 0 = Sunday
}

// Start of the 14-day pay fortnight containing `date`, counted from `anchor`
// (any date a fortnight starts on). Works for dates before the anchor too.
export function fortnightStartFor(date: string, anchor: string): string {
  return addDays(anchor, Math.floor(daysBetween(anchor, date) / 14) * 14);
}

export function melbourneToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function melbourneTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// "20 Oct"
export function formatDayMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

// "Mon 20 Oct"
export function formatWeekdayDate(date: string): string {
  return `${weekdayOf(date).slice(0, 3)} ${formatDayMonth(date)}`;
}

// "20-Oct-26", the style the printable Roster tab has always used.
export function formatSheetDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${String(y).slice(-2)}`;
}

// "20 Oct – 2 Nov 2026"
export function formatDateRange(start: string, end: string): string {
  return `${formatDayMonth(start)} – ${formatDayMonth(end)} ${end.slice(0, 4)}`;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function mod1440(minutes: number): number {
  return ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

// Minutes since midnight → "HH:MM" (wraps past midnight / before it).
export function formatMinutes(totalMinutes: number): string {
  const t = mod1440(totalMinutes);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, "")}h`;
}
