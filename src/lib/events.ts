import { randomUUID } from "crypto";
import { TIME_PATTERN } from "./availability";
import { formatMinutes, isValidDate, normalizeDate, toMinutes } from "./dates";
import { getStore, tabName, withLock } from "./store";
import {
  type EventTask,
  GENERAL_TASK_ID,
  GENERAL_TASK_NAME,
  formatTasksCell,
  parseTasksCell,
  parseTasksInput,
} from "./tasks";

// The Events tab: one row per event. Columns after "ID" were added later;
// rows written before they existed read with the defaults below, and new
// columns are only ever added at the right-hand end.
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
  "Tasks",
  "Status",
  "Rev",
  "Guests",
];
const TASKS_COLUMN = 14;
const STATUS_COLUMN = 15;
const REV_COLUMN = 16;
const GUESTS_COLUMN = 17;
const MAX_GUESTS = 100000;

export const DEFAULT_STAFF_NEEDED = 1;
export const DEFAULT_SETUP_HOURS = 1;
export const DEFAULT_PACK_DOWN_HOURS = 1;
const MAX_STAFF_NEEDED = 100;
const MAX_EXTRA_HOURS = 12;
const MAX_REASON_LENGTH = 200;

const ACTION_LINE_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)\s+)?(.+)$/;
const ROSTER_LINE_PATTERN = /^(.*?)\s+([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/;
// Separates the parts of a Rostered Staff line: "Ann 14:00-16:00 · Soft Setup · locked".
const SEPARATOR = " · ";

export interface EventAction {
  label: string;
  time: string; // "" if not set — the action is treated as starting with the event
}

// One person on one of the event's tasks. Empty times mean they work the
// whole task (for the general task: the event's shift, setup → pack-down).
export interface RosterEntry {
  name: string;
  startTime: string;
  endTime: string;
  taskId?: string; // "" / missing = the general "Event staff" task
  locked?: boolean; // kept by Clear; changed only on purpose
  override?: string; // why the manager rostered them despite a warning
}

export type EventStatus = "draft" | "published";

export interface EventRecord {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM — at or before startTime means it ends after midnight
  location: string;
  notes: string;
  actions: EventAction[];
  // For events with no tasks: how many general staff it needs (the general
  // "Event staff" task). With tasks it is their total, kept for the sheet.
  staffNeeded: number;
  setupHours: number; // staff start this long before the event
  packDownHours: number; // and finish this long after it
  // Its staff may also work other functions at the same time (e.g. Studio 1
  // covered by the Great Room team). Their time is counted once.
  shareStaff: boolean;
  tasks: EventTask[]; // [] = just the general task (events saved before tasks existed)
  status: EventStatus; // drafts aren't shown to staff
  rev: number; // goes up on every change; used to catch two people editing at once
  guests?: number | null; // expected guests, if known
  staff: RosterEntry[];
}

export type EventInput = Omit<EventRecord, "id" | "staff" | "rev" | "status"> & { status?: EventStatus };

export class ConflictError extends Error {
  constructor() {
    super("Someone else changed this event while you were working on it. Reload to see the latest version.");
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Event not found");
  }
}

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

const cleanText = (value: string) => value.replace(/[·\n\r]+/g, " ").replace(/\s+/g, " ").trim();

// One line per assignment. Events without tasks use the original format
// ("Ann" or "Ann 18:00-23:00"), so older copies of the app can still read them.
export function formatRosterCell(staff: RosterEntry[], tasks: EventTask[] = []): string {
  return staff
    .map((s) => {
      const parts = [s.startTime && s.endTime ? `${s.name} ${s.startTime}-${s.endTime}` : s.name];
      const task = tasks.find((t) => t.id === (s.taskId || GENERAL_TASK_ID));
      if (tasks.length > 0) parts.push(task ? task.name : s.taskId || GENERAL_TASK_NAME);
      if (s.locked) parts.push("locked");
      if (s.override) parts.push(`override: ${cleanText(s.override)}`);
      return parts.join(SEPARATOR);
    })
    .join("\n");
}

export function parseRosterCell(cell: string, tasks: EventTask[] = []): RosterEntry[] {
  const entries: RosterEntry[] = [];
  for (const line of cell.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [first, ...rest] = line.split(SEPARATOR).map((p) => p.trim());
    const match = first.match(ROSTER_LINE_PATTERN);
    const entry: RosterEntry = match
      ? { name: match[1].trim(), startTime: `${match[2]}:${match[3]}`, endTime: `${match[4]}:${match[5]}` }
      : { name: first, startTime: "", endTime: "" };
    for (const part of rest) {
      if (part.toLowerCase() === "locked") entry.locked = true;
      else if (/^override:/i.test(part)) entry.override = part.replace(/^override:\s*/i, "");
      else {
        const task =
          tasks.find((t) => t.name.toLowerCase() === part.toLowerCase()) ?? tasks.find((t) => t.id === part);
        // An unknown task name is kept as written, so nothing is lost.
        entry.taskId = task ? task.id : part;
      }
    }
    if (entry.taskId === GENERAL_TASK_ID) delete entry.taskId;
    const key = (e: RosterEntry) => `${e.name.toLowerCase()}|${e.taskId ?? ""}|${e.startTime}|${e.endTime}`;
    if (!entries.some((e) => key(e) === key(entry))) entries.push(entry);
  }
  return entries;
}

function parseCount(cell: string | undefined, fallback: number, max: number): number {
  if (cell === undefined || cell.trim() === "") return fallback;
  const value = Number(cell);
  return Number.isFinite(value) && value >= 0 && value <= max ? value : fallback;
}

// A single plain "Event staff" task is how an event without tasks is shown in
// the app; it is saved the original way (Staff Needed, no Tasks cell).
function isPlainGeneral(task: EventTask): boolean {
  return (
    task.id === GENERAL_TASK_ID &&
    task.typeId === "" &&
    task.name === GENERAL_TASK_NAME &&
    !task.startTime &&
    !task.endTime &&
    !task.notes &&
    task.mandatory &&
    !task.skillId &&
    task.qualificationIds.length === 0 &&
    task.demand === "low" &&
    task.minTeam === 1 &&
    !task.controls &&
    !task.needsSupervisor &&
    !task.leadership
  );
}

export function normalizeTasks<T extends Pick<EventRecord, "tasks" | "staffNeeded">>(event: T): T {
  if (event.tasks.length === 1 && isPlainGeneral(event.tasks[0])) {
    return { ...event, tasks: [], staffNeeded: event.tasks[0].count };
  }
  if (event.tasks.length === 0) return event;
  return { ...event, staffNeeded: event.tasks.reduce((sum, t) => sum + t.count, 0) };
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
    formatRosterCell(event.staff, event.tasks),
    event.shareStaff ? "Yes" : "",
    formatTasksCell(event.tasks),
    event.status === "draft" ? "Draft" : "",
    event.rev,
    event.guests ?? "",
  ];
}

export function sortEvents(events: EventRecord[]): EventRecord[] {
  return [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );
}

// Splits the tab into readable events and rows someone broke by hand in the
// sheet (no valid date or times, or a Tasks cell that can't be read). Broken
// rows are skipped rather than crashing every page, and are written back
// untouched until they're fixed.
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
    const tasks = parseTasksCell(r[TASKS_COLUMN] ?? "");
    if (!date || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || tasks === null) {
      unreadable.push(r);
      continue;
    }
    let id = r[8] ?? "";
    if (!id || seenIds.has(id)) id = `row-${index + 1}`;
    seenIds.add(id);
    const rev = Number(r[REV_COLUMN]);
    const guests = Number(r[GUESTS_COLUMN]);
    events.push(
      normalizeTasks({
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
        staff: parseRosterCell(r[12] ?? "", tasks),
        shareStaff: /^(yes|y|true|1)$/i.test((r[13] ?? "").trim()),
        tasks,
        status: /^draft$/i.test((r[STATUS_COLUMN] ?? "").trim()) ? "draft" : "published",
        rev: Number.isInteger(rev) && rev >= 0 ? rev : 0,
        guests: (r[GUESTS_COLUMN] ?? "").trim() && Number.isInteger(guests) && guests >= 0 ? guests : null,
      })
    );
  }
  return { events: sortEvents(events), unreadable };
}

export function parseEventRows(rows: string[][]): EventRecord[] {
  return splitRows(rows).events;
}

export function countUnreadableRows(rows: string[][]): number {
  return splitRows(rows).unreadable.length;
}

async function readRawRows(): Promise<string[][]> {
  return getStore().read(tabName("events"));
}

// Rewrites the whole tab, sorted by date, in one write. Unreadable rows are
// kept as they were so a bad cell never deletes an event. Each event whose
// row changed gets the next revision number.
async function writeEvents(events: EventRecord[], raw: string[][]): Promise<EventRecord[]> {
  const { events: before, unreadable } = splitRows(raw);
  const content = (e: EventRecord) => JSON.stringify(toRow(0, { ...e, rev: 0 }));
  const saved = sortEvents(events.map(normalizeTasks)).map((e) => {
    const old = before.find((b) => b.id === e.id);
    return old && content(old) === content(e) ? { ...e, rev: old.rev } : { ...e, rev: (old?.rev ?? e.rev) + 1 };
  });
  const rows = [
    HEADER,
    ...saved.map((e, i) => toRow(i + 1, e)),
    ...unreadable.map((r, i) => [saved.length + i + 1, ...r.slice(1)]),
  ];
  await getStore().writeAll(tabName("events"), rows);
  return saved;
}

export async function listEvents(): Promise<EventRecord[]> {
  return parseEventRows(await readRawRows());
}

// Every change is read → change → write while holding the tab's lock, so two
// requests to this server can't overwrite each other's changes.
async function changeEvents<T>(change: (events: EventRecord[]) => { events: EventRecord[]; result: T }) {
  return withLock(tabName("events"), async () => {
    const raw = await readRawRows();
    const { events, result } = change(parseEventRows(raw));
    const saved = await writeEvents(events, raw);
    return { saved, result };
  });
}

export async function createEvent(input: EventInput): Promise<EventRecord> {
  const event: EventRecord = { id: randomUUID(), ...input, status: input.status ?? "draft", rev: 0, staff: [] };
  const { saved } = await changeEvents((events) => ({ events: [...events, event], result: null }));
  return saved.find((e) => e.id === event.id)!;
}

// Changes one event. `change` also sees every event as it is now (to check
// clashes), and may throw a ValidationError to refuse the change.
export async function modifyEvent(
  id: string,
  expectedRev: number | undefined,
  change: (event: EventRecord, all: EventRecord[]) => EventRecord
): Promise<EventRecord> {
  const { saved } = await changeEvents((events) => {
    const index = events.findIndex((e) => e.id === id);
    if (index === -1) throw new NotFoundError();
    if (expectedRev !== undefined && events[index].rev !== expectedRev) throw new ConflictError();
    const next = [...events];
    next[index] = change(events[index], events);
    return { events: next, result: null };
  });
  return saved.find((e) => e.id === id)!;
}

// Moves every task (and anyone's own times) by `minutes`, for when the event
// itself moved and the manager asked for its tasks to follow.
function moveTimes(event: EventRecord, minutes: number): Pick<EventRecord, "tasks" | "staff"> {
  const move = (time: string) => (time ? formatMinutes(toMinutes(time) + minutes) : time);
  return {
    tasks: event.tasks.map((t) => ({ ...t, startTime: move(t.startTime), endTime: move(t.endTime) })),
    staff: event.staff.map((s) => ({ ...s, startTime: move(s.startTime), endTime: move(s.endTime) })),
  };
}

// Updates the event's details and tasks; who is rostered stays as it is.
// Task times only move with the event when `moveTasks` is set. Removing a
// task someone is on is refused, so no one silently drops off the roster.
export async function updateEvent(
  id: string,
  input: EventInput,
  options: { rev?: number; moveTasks?: boolean } = {}
): Promise<EventRecord> {
  return modifyEvent(id, options.rev, (event) => {
    let next: EventRecord = { ...event, ...input, status: input.status ?? event.status };
    if (options.moveTasks && input.startTime !== event.startTime) {
      let delta = toMinutes(input.startTime) - toMinutes(event.startTime);
      if (delta > 720) delta -= 1440;
      if (delta <= -720) delta += 1440;
      next = { ...next, ...moveTimes({ ...next, tasks: input.tasks }, delta) };
    }
    const kept = new Set((next.tasks.length ? next.tasks : [{ id: GENERAL_TASK_ID }]).map((t) => t.id));
    const orphan = next.staff.find((s) => !kept.has(s.taskId || GENERAL_TASK_ID));
    if (orphan) {
      throw new ValidationError(`${orphan.name} is still on a task you removed — take them off it or move them first`);
    }
    return next;
  });
}

export class ValidationError extends Error {}

export async function setEventStaff(id: string, staff: RosterEntry[], rev?: number): Promise<EventRecord> {
  return modifyEvent(id, rev, (event) => ({ ...event, staff }));
}

// The status a request gets for an error from the functions above.
export function eventErrorStatus(err: unknown): number | null {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  if (err instanceof ValidationError) return 400;
  return null;
}

// Applies `change` to every event and saves, in one read and one write.
export async function updateAllEvents<T = null>(
  change: (events: EventRecord[]) => EventRecord[] | { events: EventRecord[]; result: T }
): Promise<{ events: EventRecord[]; result: T | null }> {
  const { saved, result } = await changeEvents((events) => {
    const out = change(events);
    return Array.isArray(out) ? { events: out, result: null } : out;
  });
  return { events: saved, result };
}

export async function deleteEvent(id: string): Promise<void> {
  await changeEvents((events) => ({ events: events.filter((e) => e.id !== id), result: null }));
}

// --- Request parsing ---------------------------------------------------------

function parseNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "number" ? value : Number(value);
}

// Validates an event sent from the app. Returns an error message or the input.
export function parseEventInput(body: unknown): EventInput | string {
  if (typeof body !== "object" || body === null) return "Invalid event data";
  const b = body as Record<string, unknown>;
  const text = (value: unknown, max = 2000) => (typeof value === "string" ? value.trim().slice(0, max) : "");

  const name = text(b.name, 120);
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
    actions.push({ label: text(label, 200), time: text(time) });
  }

  const tasks = parseTasksInput(b.tasks);
  if (typeof tasks === "string") return tasks;
  const guests = b.guests === undefined || b.guests === null || b.guests === "" ? null : Number(b.guests);
  if (guests !== null && (!Number.isInteger(guests) || guests < 0 || guests > MAX_GUESTS)) return "Guests must be a whole number";
  if (b.status !== undefined && b.status !== "draft" && b.status !== "published") return "Unknown status";

  return normalizeTasks({
    name,
    date,
    startTime,
    endTime,
    location: text(b.location, 200),
    notes: text(b.notes),
    actions,
    staffNeeded,
    setupHours,
    packDownHours,
    shareStaff: b.shareStaff === true,
    tasks,
    guests,
    status: b.status as EventStatus | undefined,
  });
}

// Validates a roster list sent from the app. Returns an error message or the
// entries (whether each person may do that work is checked separately).
export function parseRosterInput(body: unknown): RosterEntry[] | string {
  const list = (body as { staff?: unknown } | null)?.staff;
  if (!Array.isArray(list)) return "Invalid roster";
  const entries: RosterEntry[] = [];
  for (const item of list) {
    const { name, startTime, endTime, taskId, locked, override } = (item ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return "Each rostered person needs a name";
    if (/[·\n\r]/.test(name)) return "Names can't contain line breaks or “·”";
    const start = typeof startTime === "string" ? startTime : "";
    const end = typeof endTime === "string" ? endTime : "";
    if ((start || end) && !(TIME_PATTERN.test(start) && TIME_PATTERN.test(end))) {
      return "Shift times must be in HH:MM format";
    }
    if (start && start === end) return "A shift must end at a different time than it starts";
    const entry: RosterEntry = { name: name.trim(), startTime: start, endTime: end };
    if (typeof taskId === "string" && taskId && taskId !== GENERAL_TASK_ID) entry.taskId = taskId.slice(0, 80);
    if (locked === true) entry.locked = true;
    if (typeof override === "string" && cleanText(override)) {
      entry.override = cleanText(override).slice(0, MAX_REASON_LENGTH);
    }
    const same = entries.find(
      (e) =>
        e.name.toLowerCase() === entry.name.toLowerCase() &&
        (e.taskId ?? "") === (entry.taskId ?? "") &&
        e.startTime === entry.startTime &&
        e.endTime === entry.endTime
    );
    if (same) return `${entry.name} is listed twice on the same task`;
    entries.push(entry);
  }
  return entries;
}
