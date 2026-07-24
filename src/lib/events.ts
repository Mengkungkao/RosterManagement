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
  "ID",
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface EventRecord {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  notes: string;
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
  return null;
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
      .filter((r) => r[1] && r[7])
      .map((r) => ({
        name: String(r[1]),
        date: String(r[2] || ""),
        startTime: String(r[3] || ""),
        endTime: String(r[4] || ""),
        location: String(r[5] || ""),
        notes: String(r[6] || ""),
        id: String(r[7]),
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
