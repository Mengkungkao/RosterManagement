import { columnLetter, getSheetId, getSheetsClient } from "./google-client";
import type { EventRecord } from "./events";
import { getMelbourneWeekday } from "./roster-grid";
import type { AssignedStaff, RosterAssignment } from "./roster-assignment";

const HEADER = [
  "No",
  "Event Name",
  "Date",
  "Day",
  "Start Time",
  "End Time",
  "Location",
  "Staff Needed",
  "Assigned Staff",
  "Status",
  "Generated At",
  "Event ID",
];
const EVENT_ID_COLUMN = HEADER.length - 1;
const PARTIAL_SUFFIX = /\s*\(partial\)\s*$/i;

function getSheetName() {
  return process.env.GOOGLE_ROSTER_SHEET_TAB || "Roster";
}

function formatAssignedCell(assigned: AssignedStaff[]): string {
  return assigned
    .map((a) => (a.coverage === "partial" ? `${a.staffName} (partial)` : a.staffName))
    .join("\n");
}

function parseAssignedCell(cell: string): AssignedStaff[] {
  return cell
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const partial = PARTIAL_SUFFIX.test(line);
      return {
        staffName: line.replace(PARTIAL_SUFFIX, "").trim(),
        coverage: partial ? ("partial" as const) : ("full" as const),
      };
    });
}

function statusLabel(assignment: RosterAssignment): string {
  if (assignment.staffNeeded === 0) return "No staff needed";
  if (assignment.assigned.length === 0) return "Unfilled";
  if (assignment.shortfall === 0) return "Filled";
  return `Short by ${assignment.shortfall}`;
}

export async function saveRosterAssignments(
  events: EventRecord[],
  assignments: RosterAssignment[]
): Promise<void> {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const rows = assignments
    .map((assignment) => ({ assignment, event: eventsById.get(assignment.eventId) }))
    .filter(
      (row): row is { assignment: RosterAssignment; event: EventRecord } => !!row.event
    )
    .sort((a, b) => {
      const dateCompare = a.event.date.localeCompare(b.event.date);
      return dateCompare !== 0
        ? dateCompare
        : a.event.startTime.localeCompare(b.event.startTime);
    });

  const values = [
    HEADER,
    ...rows.map(({ assignment, event }, i) => [
      i + 1,
      event.name,
      event.date,
      getMelbourneWeekday(event.date),
      event.startTime,
      event.endTime,
      event.location,
      assignment.staffNeeded,
      formatAssignedCell(assignment.assigned),
      statusLabel(assignment),
      assignment.generatedAt,
      event.id,
    ]),
  ];

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

export async function listRosterAssignments(): Promise<RosterAssignment[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!A2:${columnLetter(HEADER.length - 1)}`,
  });
  const rows = res.data.values || [];

  return rows
    .filter((r) => r[EVENT_ID_COLUMN])
    .map((r) => {
      const assigned = parseAssignedCell(String(r[8] || ""));
      const staffNeeded = Number(r[7]) || 0;
      return {
        eventId: String(r[EVENT_ID_COLUMN]),
        assigned,
        staffNeeded,
        shortfall: Math.max(0, staffNeeded - assigned.length),
        generatedAt: String(r[10] || ""),
      };
    });
}
