import { randomUUID } from "crypto";
import { columnLetter, getSheetId, getSheetsClient } from "./google-client";
import { TIME_PATTERN } from "./availability";

const HEADER = [
  "No",
  "Event Name",
  "Date",
  "Start Time",
  "End Time",
  "Location",
  "Notes",
  "Phases",
  "ID",
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PHASE_LINE_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)\s+)?(.+)$/;

export interface EventPhase {
  label: string;
  time: string; // "" if not set — the phase is treated as starting with the event
}

export interface EventRecord {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  notes: string;
  phases: EventPhase[];
}

export type EventInput = Omit<EventRecord, "id">;

function getSheetName() {
  return process.env.GOOGLE_EVENTS_SHEET_TAB || "Events";
}

function validateInput(input: EventInput): string | null {
  if (!input.name.trim()) return "Event name is required";
  if (!DATE_PATTERN.test(input.date)) return "Date must be in YYYY-MM-DD format";
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    return "Start and end time must be in HH:MM format";
  }
  for (const phase of input.phases) {
    if (!phase.label.trim()) return "Each phase needs a label";
    if (phase.time && !TIME_PATTERN.test(phase.time)) {
      return "Phase times must be in HH:MM format";
    }
  }
  return null;
}

function formatPhasesCell(phases: EventPhase[]): string {
  return phases
    .filter((p) => p.label.trim())
    .map((p) => (p.time ? `${p.time} ${p.label.trim()}` : p.label.trim()))
    .join("\n");
}

function parsePhasesCell(cell: string): EventPhase[] {
  return cell
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(PHASE_LINE_PATTERN);
      if (!match) return { label: line, time: "" };
      const [, hour, minute, label] = match;
      return { label, time: hour ? `${hour}:${minute}` : "" };
    });
}

function toRow(no: number, event: EventRecord): (string | number)[] {
  return [
    no,
    event.name,
    event.date,
    event.startTime,
    event.endTime,
    event.location,
    event.notes,
    formatPhasesCell(event.phases),
    event.id,
  ];
}

function sortEvents(events: EventRecord[]): EventRecord[] {
  return [...events].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime);
  });
}

async function readRows(): Promise<EventRecord[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!A2:${columnLetter(HEADER.length - 1)}`,
  });
  const rows = res.data.values || [];

  return sortEvents(
    rows
      .filter((r) => r[1] && r[8])
      .map((r) => ({
        name: String(r[1]),
        date: String(r[2] || ""),
        startTime: String(r[3] || ""),
        endTime: String(r[4] || ""),
        location: String(r[5] || ""),
        notes: String(r[6] || ""),
        phases: parsePhasesCell(String(r[7] || "")),
        id: String(r[8]),
      }))
  );
}

async function writeAll(events: EventRecord[]): Promise<void> {
  const sorted = sortEvents(events);
  const values = [HEADER, ...sorted.map((e, i) => toRow(i + 1, e))];

  const sheets = await getSheetsClient();
  const sheetId = getSheetId();
  const sheetName = getSheetName();

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: sheetName,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function listEvents(): Promise<EventRecord[]> {
  return readRows();
}

export async function createEvent(input: EventInput): Promise<EventRecord> {
  const error = validateInput(input);
  if (error) throw new Error(error);

  const event: EventRecord = { id: randomUUID(), ...input };
  const events = await readRows();
  await writeAll([...events, event]);
  return event;
}

export async function updateEvent(
  id: string,
  input: EventInput
): Promise<EventRecord> {
  const error = validateInput(input);
  if (error) throw new Error(error);

  const events = await readRows();
  const index = events.findIndex((e) => e.id === id);
  if (index === -1) throw new Error("Event not found");

  const updated: EventRecord = { id, ...input };
  events[index] = updated;
  await writeAll(events);
  return updated;
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await readRows();
  await writeAll(events.filter((e) => e.id !== id));
}

function parsePhasesInput(value: unknown): EventPhase[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const phases: EventPhase[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { label, time } = item as Record<string, unknown>;
    if (typeof label !== "string") return null;
    if (time !== undefined && typeof time !== "string") return null;
    if (!label.trim()) continue;
    phases.push({ label: label.trim(), time: (time as string | undefined)?.trim() || "" });
  }
  return phases;
}

export function parseEventInput(body: unknown): EventInput | null {
  if (typeof body !== "object" || body === null) return null;
  const { name, date, startTime, endTime, location, notes, phases } =
    body as Record<string, unknown>;

  if (
    typeof name !== "string" ||
    typeof date !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string"
  ) {
    return null;
  }

  const parsedPhases = parsePhasesInput(phases);
  if (parsedPhases === null) return null;

  return {
    name: name.trim(),
    date: date.trim(),
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    location: typeof location === "string" ? location.trim() : "",
    notes: typeof notes === "string" ? notes.trim() : "",
    phases: parsedPhases,
  };
}
