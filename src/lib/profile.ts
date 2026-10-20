// The parts of a staff profile beyond availability: work restrictions,
// shift preferences, and time-off / change requests. Pure functions only.
//
// Restrictions hold only what rostering needs ("no heavy manual handling
// until 1 Dec") — never medical details — and are shown to admins only.

import { isValidDate, weekdayOf } from "./dates";
import type { Demand } from "./tasks";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const date = (value: unknown) => (typeof value === "string" && isValidDate(value) ? value : "");

// --- Work restrictions -----------------------------------------------------------

export const RESTRICTION_TYPES = ["no_heavy", "no_manual_handling", "note"] as const;
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];
export const RESTRICTION_LABELS: Record<RestrictionType, string> = {
  no_heavy: "No heavy manual handling",
  no_manual_handling: "No manual handling",
  note: "Other (check before rostering)",
};

export interface Restriction {
  type: RestrictionType;
  note: string; // work-related only, e.g. "lifting limit 10 kg"
  until: string; // last day it applies; "" = until removed
}

export function restrictionApplies(r: Restriction, onDate: string): boolean {
  return !r.until || r.until >= onDate;
}

// The restriction that rules someone out of work at `demand`, if any.
export function blockingRestriction(restrictions: Restriction[], demand: Demand, onDate: string): Restriction | null {
  return (
    restrictions.find(
      (r) =>
        restrictionApplies(r, onDate) &&
        ((r.type === "no_heavy" && demand === "high") ||
          (r.type === "no_manual_handling" && (demand === "high" || demand === "moderate")))
    ) ?? null
  );
}

export function describeRestriction(r: Restriction): string {
  const base = r.type === "note" ? r.note || "Restriction" : RESTRICTION_LABELS[r.type];
  const note = r.type !== "note" && r.note ? ` (${r.note})` : "";
  return `${base}${note}${r.until ? ` until ${r.until}` : ""}`;
}

function cleanRestriction(value: unknown): Restriction | null {
  const v = (value ?? {}) as Record<string, unknown>;
  if (!(RESTRICTION_TYPES as readonly string[]).includes(v.type as string)) return null;
  const r = { type: v.type as RestrictionType, note: text(v.note, 200), until: date(v.until) };
  return r.type === "note" && !r.note ? null : r;
}

// --- Shift preferences -------------------------------------------------------------

export const SHIFT_PREFERENCES = ["mornings", "afternoons", "evenings", "late_nights", "weekdays", "weekends"] as const;
export type ShiftPreference = (typeof SHIFT_PREFERENCES)[number];
export const SHIFT_PREFERENCE_LABELS: Record<ShiftPreference, string> = {
  mornings: "Mornings",
  afternoons: "Afternoons",
  evenings: "Evenings",
  late_nights: "Late nights",
  weekdays: "Weekdays",
  weekends: "Weekends",
};

// Whether a shift on `onDate` from `start` to `end` (minutes from midnight of
// that date) is the kind someone said they prefer.
export function matchesPreference(pref: ShiftPreference, onDate: string, start: number, end: number): boolean {
  const weekend = ["Saturday", "Sunday"].includes(weekdayOf(onDate));
  switch (pref) {
    case "mornings":
      return start < 12 * 60;
    case "afternoons":
      return start >= 11 * 60 && start < 17 * 60;
    case "evenings":
      return end > 18 * 60;
    case "late_nights":
      return end > 24 * 60;
    case "weekdays":
      return !weekend;
    case "weekends":
      return weekend;
  }
}

export function parsePreferencesCell(cell: string): ShiftPreference[] {
  const words = cell.toLowerCase().split(/\s*[,;\n]\s*/);
  return SHIFT_PREFERENCES.filter((p) => words.includes(SHIFT_PREFERENCE_LABELS[p].toLowerCase()) || words.includes(p));
}

export function formatPreferencesCell(prefs: ShiftPreference[]): string {
  return SHIFT_PREFERENCES.filter((p) => prefs.includes(p))
    .map((p) => SHIFT_PREFERENCE_LABELS[p])
    .join(", ");
}

export function parsePreferencesInput(input: unknown): ShiftPreference[] | string {
  if (!Array.isArray(input)) return "Invalid preferences";
  if (!input.every((p) => (SHIFT_PREFERENCES as readonly string[]).includes(p))) return "Unknown preference";
  return SHIFT_PREFERENCES.filter((p) => input.includes(p));
}

// --- Requests (time off, shift changes) ------------------------------------------

export const REQUEST_STATUSES = ["pending", "approved", "declined", "resolved", "withdrawn"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface StaffRequest {
  id: string;
  kind: "time_off" | "change";
  from: string; // time off: first day; change: the shift's date
  to: string; // time off: last day; change: same as from
  eventId: string; // change requests: the event it's about
  eventName: string;
  note: string;
  status: RequestStatus;
  submitted: string; // "YYYY-MM-DD HH:MM:SS"
  decided: string; // when an admin approved/declined/resolved it
}

export const MAX_REQUESTS_KEPT = 40;

// Time off that keeps someone off the roster: asked for (not yet answered) or approved.
export function timeOffOn(requests: StaffRequest[], from: string, to: string): StaffRequest | null {
  return (
    requests.find(
      (r) => r.kind === "time_off" && (r.status === "pending" || r.status === "approved") && r.from <= to && r.to >= from
    ) ?? null
  );
}

function cleanRequest(value: unknown): StaffRequest | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const kind = v.kind === "change" ? "change" : v.kind === "time_off" ? "time_off" : null;
  const status = (REQUEST_STATUSES as readonly string[]).includes(v.status as string) ? (v.status as RequestStatus) : null;
  const from = date(v.from);
  const to = date(v.to) || from;
  const id = text(v.id, 40);
  if (!kind || !status || !from || !id || to < from) return null;
  return {
    id,
    kind,
    from,
    to,
    eventId: text(v.eventId, 80),
    eventName: text(v.eventName, 120),
    note: text(v.note, 500),
    status,
    submitted: text(v.submitted, 20),
    decided: text(v.decided, 20),
  };
}

function parseJsonList<T>(cell: string, clean: (v: unknown) => T | null): T[] | null {
  if (!cell.trim()) return [];
  try {
    const data = JSON.parse(cell);
    if (!Array.isArray(data)) return null;
    return data.map(clean).filter((x): x is T => x !== null);
  } catch {
    return null;
  }
}

// Cells that can't be read return null: the row keeps the original text and
// the Staff page says it needs fixing in the sheet.
export const parseRestrictionsCell = (cell: string) => parseJsonList(cell, cleanRestriction);
export const parseRequestsCell = (cell: string) => parseJsonList(cell, cleanRequest);

export const formatRestrictionsCell = (list: Restriction[]) => (list.length ? JSON.stringify(list) : "");

// Keeps every open request and the most recent answered ones.
export function formatRequestsCell(list: StaffRequest[]): string {
  const open = list.filter((r) => r.status === "pending");
  const closed = list
    .filter((r) => r.status !== "pending")
    .sort((a, b) => b.submitted.localeCompare(a.submitted))
    .slice(0, Math.max(0, MAX_REQUESTS_KEPT - open.length));
  const kept = [...open, ...closed].sort((a, b) => a.submitted.localeCompare(b.submitted));
  return kept.length ? JSON.stringify(kept) : "";
}

export function parseRestrictionsInput(input: unknown): Restriction[] | string {
  if (!Array.isArray(input)) return "Invalid restrictions";
  const list: Restriction[] = [];
  for (const item of input) {
    const r = cleanRestriction(item);
    if (!r) return "Each restriction needs a type (and a note for “Other”)";
    const v = item as Record<string, unknown>;
    if (v.until && !r.until) return "The restriction's end date isn't a date";
    list.push(r);
  }
  return list;
}

// A new request from a staff member.
export function parseRequestInput(
  input: unknown,
  today: string
): Pick<StaffRequest, "kind" | "from" | "to" | "eventId" | "note"> | string {
  const v = (input ?? {}) as Record<string, unknown>;
  const note = text(v.note, 500);
  if (v.kind === "time_off") {
    const from = date(v.from);
    const to = date(v.to) || from;
    if (!from) return "Choose the first day you can't work";
    if (to < from) return "The last day must be on or after the first day";
    if (to < today) return "Those dates have already passed";
    return { kind: "time_off", from, to, eventId: "", note };
  }
  if (v.kind === "change") {
    const eventId = text(v.eventId, 80);
    if (!eventId) return "Choose the shift";
    if (!note) return "Say what you need changed";
    return { kind: "change", from: "", to: "", eventId, note };
  }
  return "Unknown request";
}
