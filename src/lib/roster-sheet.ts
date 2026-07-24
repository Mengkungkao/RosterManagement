import { getSheetId, getSheetsClient } from "./google-client";
import type { EventRecord } from "./events";
import { DAYS } from "./availability";
import type { RosterResult } from "./roster-assignment";

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getSheetName() {
  return process.env.GOOGLE_ROSTER_SHEET_TAB || "Roster";
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${String(day).padStart(2, "0")}-${MONTH_ABBR[month - 1]}-${String(year).slice(-2)}`;
}

function formatEventSummary(event: EventRecord): string {
  const lines = [`${event.name} ${event.startTime}-${event.endTime}`];
  if (event.location) lines.push(event.location);
  if (event.phases.length > 0) {
    lines.push(
      event.phases.map((p) => (p.time ? `${p.label} ${p.time}` : p.label)).join(", ")
    );
  }
  if (event.notes) lines.push(event.notes);
  return lines.join("\n");
}

// Writes a printable weekly roster: staff down the rows, days across the
// columns, with each day's planned events summarized above the staff block
// so whoever reads the sheet can see what they're rostering against.
export async function saveRoster(events: EventRecord[], result: RosterResult): Promise<void> {
  const byDay = new Map(result.days.map((d) => [d.day, d]));

  const eventDates = events.map((e) => e.date).filter(Boolean).sort();
  const title =
    eventDates.length > 0
      ? `Staff Roster ${formatDisplayDate(eventDates[0])} to ${formatDisplayDate(eventDates[eventDates.length - 1])}`
      : "Staff Roster";

  const dateRow = ["", ...DAYS.map((day) => {
    const entry = byDay.get(day);
    return entry ? formatDisplayDate(entry.date) : "";
  })];

  const eventsRow = ["Events", ...DAYS.map((day) => {
    const entry = byDay.get(day);
    return entry ? entry.events.map(formatEventSummary).join("\n\n") : "";
  })];

  const shiftByStaffAndDay = new Map<string, Map<string, string>>();
  for (const day of result.days) {
    for (const shift of day.shifts) {
      if (!shiftByStaffAndDay.has(shift.staffName)) {
        shiftByStaffAndDay.set(shift.staffName, new Map());
      }
      shiftByStaffAndDay.get(shift.staffName)!.set(day.day, shift.label);
    }
  }

  const staffRows = result.staffNames.map((name) => [
    name,
    ...DAYS.map((day) => shiftByStaffAndDay.get(name)?.get(day) || ""),
  ]);

  const blankRow = () => Array(DAYS.length + 1).fill("");

  const values = [
    [title, ...Array(DAYS.length).fill("")],
    ["Name", ...DAYS],
    dateRow,
    eventsRow,
    ["Closing Sets", ...Array(DAYS.length).fill("")],
    ["Mid-shift Sets", ...Array(DAYS.length).fill("")],
    blankRow(),
    ...staffRows,
    blankRow(),
    [`Generated ${result.generatedAt}`, ...Array(DAYS.length).fill("")],
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
