import { randomUUID } from "crypto";
import { TIME_PATTERN } from "./availability";
import { isValidDate, normalizeDate } from "./dates";
import { getStore, tabName } from "./store";

// The Events tab: one row per event. Columns after "ID" were added for
// rostering; rows written before they existed read with the defaults below.
const HEADER = [
  "No",
  "Event Name",
  "Date",
  "Start Time",
  "End Time",
  "Location",
  "Actions",
  "Notes",
  "ID",
  "Staff Needed",
  "Setup Hours",
  "Pack-down Hours",
  "Rostered Staff",
  "Share Staff",
];

export const DEFAULT_STAFF_NEEDED = 1;
export const DEFAULT_SETUP_HOURS = 1;
export const DEFAULT_PACK_DOWN_HOURS = 1;
const MAX_STAFF_NEEDED = 100;
const MAX_EXTRA_HOURS = 12;

const ACTION_LINE_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)\s+)?(.+)$/;
const ROSTER_LINE_PATTERN = /^(.*?)\s+([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/;

export interface EventAction {
  label: string;
  time: string; // "" if not set — the action is treated as starting with the event
}

// One person rostered on an event. Empty times mean they work the event's
// whole shift (setup → pack-down); otherwise their own start/finish times.
export interface RosterEntry {
  name: string;
  startTime: string;
  endTime: string;
}

export interface EventRecord {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM — at or before startTime means it ends after midnight
  location: string;
  notes: string;
  actions: EventAction[];
  staffNeeded: number;
  setupHours: number; // staff start this long before the event
  packDownHours: number; // and finish this long after it
  // Its staff may also work other functions at the same time (e.g. Studio 1
  // covered by the Great Room team). Their time is counted once.
  shareStaff: boolean;
  staff: RosterEntry[];
}

export type EventInput = Omit<EventRecord, "id" | "staff">;

function formatActionsCell(actions: EventAction[]): string {
  return actions.map((a) => (a.time ? `${a.time} ${a.label}` : a.label)).join("\n");
}

function parseActionsCell(cell: string): EventAction[] {
  return cell
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(ACTION_LINE_PATTERN);
      if (!match) return { label: line, time: "" };
      const [, hour, minute, label] = match;
      return { label, time: hour ? `${hour}:${minute}` : "" };
    });
}

export function formatRosterCell(staff: RosterEntry[]): string {
  return staff
    .map((s) => (s.startTime && s.endTime ? `${s.name} ${s.startTime}-${s.endTime}` : s.name))
    .join("\n");
}

export function parseRosterCell(cell: string): RosterEntry[] {
  const entries: RosterEntry[] = [];
  for (const line of cell.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const match = line.match(ROSTER_LINE_PATTERN);
    const entry = match
      ? { name: match[1].trim(), startTime: `${match[2]}:${match[3]}`, endTime: `${match[4]}:${match[5]}` }
      : { name: line, startTime: "", endTime: "" };
    if (!entries.some((e) => e.name.toLowerCase() === entry.name.toLowerCase())) entries.push(entry);
  }
  return entries;
}

function parseCount(cell: string | undefined, fallback: number, max: number): number {
  if (cell === undefined || cell.trim() === "") return fallback;
  const value = Number(cell);
  return Number.isFinite(value) && value >= 0 && value <= max ? value : fallback;
}

function toRow(no: number, event: EventRecord): (string | number)[] {
  return [
    no,
    event.name,
    event.date,
    event.startTime,
    event.endTime,
    event.location,
    formatActionsCell(event.actions),
    event.notes,
    event.id,
    event.staffNeeded,
    event.setupHours,
    event.packDownHours,
    formatRosterCell(event.staff),
    event.shareStaff ? "Yes" : "",
  ];
}

export function sortEvents(events: EventRecord[]): EventRecord[] {
  return [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );
}

// Splits the tab into readable events and rows someone broke by hand in the
// sheet (no valid date or times). Broken rows are skipped rather than crashing
// every page, and are written back untouched until they're fixed.
function splitRows(rows: string[][]): { events: EventRecord[]; unreadable: string[][] } {
  // A blank ID cell, or one copy-pasted from another row in Sheets, would
  // collide with another event — give it one from its row number instead.
  // That stays the same between reads (so the event can still be edited)
  // and is saved into the sheet on the next write.
  const seenIds = new Set<string>();
  const events: EventRecord[] = [];
  const unreadable: string[][] = [];
  for (const [index, r] of rows.entries()) {
    if (index === 0) continue;
    if (!r[1]?.trim()) continue;
    const date = normalizeDate(r[2] ?? "");
    const startTime = (r[3] ?? "").trim();
    const endTime = (r[4] ?? "").trim();
    if (!date || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      unreadable.push(r);
      continue;
    }
    let id = r[8] ?? "";
    if (!id || seenIds.has(id)) id = `row-${index + 1}`;
    seenIds.add(id);
    events.push({
      id,
      name: r[1].trim(),
      date,
      startTime,
      endTime,
      location: r[5] ?? "",
      actions: parseActionsCell(r[6] ?? ""),
      notes: r[7] ?? "",
      staffNeeded: Math.floor(parseCount(r[9], DEFAULT_STAFF_NEEDED, MAX_STAFF_NEEDED)),
      setupHours: parseCount(r[10], DEFAULT_SETUP_HOURS, MAX_EXTRA_HOURS),
      packDownHours: parseCount(r[11], DEFAULT_PACK_DOWN_HOURS, MAX_EXTRA_HOURS),
      staff: parseRosterCell(r[12] ?? ""),
      shareStaff: /^(yes|y|true|1)$/i.test((r[13] ?? "").trim()),
    });
  }
  return { events: sortEvents(events), unreadable };
}

export function parseEventRows(rows: string[][]): EventRecord[] {
  return splitRows(rows).events;
}

async function readRawRows(): Promise<string[][]> {
  return getStore().read(tabName("events"));
}

// Rewrites the whole tab, sorted by date, in one write. Unreadable rows are
// kept as they were so a bad cell never deletes an event.
async function writeEvents(events: EventRecord[], raw: string[][]): Promise<void> {
  const { unreadable } = splitRows(raw);
  const sorted = sortEvents(events);
  const rows = [
    HEADER,
    ...sorted.map((e, i) => toRow(i + 1, e)),
    ...unreadable.map((r, i) => [sorted.length + i + 1, ...r.slice(1)]),
  ];
  await getStore().writeAll(tabName("events"), rows);
}

export async function listEvents(): Promise<EventRecord[]> {
  return parseEventRows(await readRawRows());
}

export async function createEvent(input: EventInput): Promise<EventRecord> {
  const raw = await readRawRows();
  const event: EventRecord = { id: randomUUID(), ...input, staff: [] };
  await writeEvents([...parseEventRows(raw), event], raw);
  return event;
}

// Updates the event's details; who is rostered on it is left as it is.
export async function updateEvent(id: string, input: EventInput): Promise<EventRecord> {
  return modifyEvent(id, (event) => ({ ...event, ...input }));
}

export async function setEventStaff(id: string, staff: RosterEntry[]): Promise<EventRecord> {
  return modifyEvent(id, (event) => ({ ...event, staff }));
}

async function modifyEvent(
  id: string,
  change: (event: EventRecord) => EventRecord
): Promise<EventRecord> {
  const raw = await readRawRows();
  const events = parseEventRows(raw);
  const index = events.findIndex((e) => e.id === id);
  if (index === -1) throw new Error("Event not found");
  events[index] = change(events[index]);
  await writeEvents(events, raw);
  return events[index];
}

// Applies `change` to every event and saves, in one read and one write.
export async function updateAllEvents(
  change: (events: EventRecord[]) => EventRecord[]
): Promise<EventRecord[]> {
  const raw = await readRawRows();
  const events = change(parseEventRows(raw));
  await writeEvents(events, raw);
  return events;
}

export async function deleteEvent(id: string): Promise<void> {
  const raw = await readRawRows();
  await writeEvents(
    parseEventRows(raw).filter((e) => e.id !== id),
    raw
  );
}

// --- Request parsing ---------------------------------------------------------

function parseNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "number" ? value : Number(value);
}

// Validates an event sent from the Events page. Returns an error message or the input.
export function parseEventInput(body: unknown): EventInput | string {
  if (typeof body !== "object" || body === null) return "Invalid event data";
  const b = body as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const name = text(b.name);
  const date = text(b.date);
  const startTime = text(b.startTime);
  const endTime = text(b.endTime);
  if (!name) return "Event name is required";
  if (!isValidDate(date)) return "Date must be a valid date";
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return "Start and end time must be in HH:MM format";
  }
  if (startTime === endTime) return "The event must end at a different time than it starts";

  const staffNeeded = parseNumber(b.staffNeeded, DEFAULT_STAFF_NEEDED);
  if (!Number.isInteger(staffNeeded) || staffNeeded < 0 || staffNeeded > MAX_STAFF_NEEDED) {
    return `Staff needed must be a whole number from 0 to ${MAX_STAFF_NEEDED}`;
  }
  const setupHours = parseNumber(b.setupHours, DEFAULT_SETUP_HOURS);
  const packDownHours = parseNumber(b.packDownHours, DEFAULT_PACK_DOWN_HOURS);
  for (const hours of [setupHours, packDownHours]) {
    if (!Number.isFinite(hours) || hours < 0 || hours > MAX_EXTRA_HOURS) {
      return `Setup and pack-down must be between 0 and ${MAX_EXTRA_HOURS} hours`;
    }
  }

  if (b.actions !== undefined && !Array.isArray(b.actions)) return "Invalid actions";
  const actions: EventAction[] = [];
  for (const item of (b.actions as unknown[] | undefined) ?? []) {
    const { label, time } = (item ?? {}) as Record<string, unknown>;
    if (!text(label)) continue;
    if (text(time) && !TIME_PATTERN.test(text(time))) return "Action times must be in HH:MM format";
    actions.push({ label: text(label), time: text(time) });
  }

  return {
    name,
    date,
    startTime,
    endTime,
    location: text(b.location),
    notes: text(b.notes),
    actions,
    staffNeeded,
    setupHours,
    packDownHours,
    shareStaff: b.shareStaff === true,
  };
}

// Validates a roster list sent from Roster Match. Returns an error message or the entries.
export function parseRosterInput(body: unknown): RosterEntry[] | string {
  const list = (body as { staff?: unknown } | null)?.staff;
  if (!Array.isArray(list)) return "Invalid roster";
  const entries: RosterEntry[] = [];
  for (const item of list) {
    const { name, startTime, endTime } = (item ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return "Each rostered person needs a name";
    const start = typeof startTime === "string" ? startTime : "";
    const end = typeof endTime === "string" ? endTime : "";
    if ((start || end) && !(TIME_PATTERN.test(start) && TIME_PATTERN.test(end))) {
      return "Shift times must be in HH:MM format";
    }
    if (start && start === end) return "A shift must end at a different time than it starts";
    if (entries.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())) {
      return `${name.trim()} is listed twice`;
    }
    entries.push({ name: name.trim(), startTime: start, endTime: end });
  }
  return entries;
}
