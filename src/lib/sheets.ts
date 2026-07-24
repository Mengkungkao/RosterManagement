import { DAYS, WeekAvailability, emptyWeek, summarizeWeek } from "./availability";
import {
  columnLetter,
  formatMelbourneTimestamp,
  getSheetId,
  getSheetsClient,
} from "./google-client";

const LEADING_HEADERS = ["No", "Name", "Status"];
const HEADER = [...LEADING_HEADERS, ...DAYS, "Last Updated"];
const FIRST_DAY_COLUMN = LEADING_HEADERS.length; // 0-based index of Monday's column
const UPDATED_AT_COLUMN = FIRST_DAY_COLUMN + DAYS.length; // 0-based index of Last Updated

export interface StaffAvailability {
  staffName: string;
  status: string;
  week: WeekAvailability;
  updatedAt: string;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_TAB || "Availability";
}

function formatDayCell(day: WeekAvailability[keyof WeekAvailability]): string {
  if (day.status === "available_all_day") return "All day";
  if (day.status === "custom") return `${day.startTime}-${day.endTime}`;
  return "Unavailable";
}

function parseDayCell(cell: string): WeekAvailability[keyof WeekAvailability] {
  const trimmed = cell.trim();
  if (trimmed.toLowerCase() === "all day") {
    return { status: "available_all_day", startTime: "", endTime: "" };
  }
  const match = trimmed.match(
    /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/
  );
  if (match) {
    return {
      status: "custom",
      startTime: `${match[1]}:${match[2]}`,
      endTime: `${match[3]}:${match[4]}`,
    };
  }
  return { status: "unavailable", startTime: "", endTime: "" };
}

async function readRows(): Promise<StaffAvailability[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!A2:${columnLetter(HEADER.length - 1)}`,
  });
  const rows = res.data.values || [];

  return rows
    .filter((r) => r[1])
    .map((r) => {
      const week = emptyWeek();
      DAYS.forEach((day, i) => {
        week[day] = parseDayCell(String(r[FIRST_DAY_COLUMN + i] ?? ""));
      });
      return {
        staffName: String(r[1]),
        status: String(r[2] || summarizeWeek(week)),
        updatedAt: String(r[UPDATED_AT_COLUMN] || ""),
        week,
      };
    })
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}

function toRow(no: number, staff: StaffAvailability): (string | number)[] {
  return [
    no,
    staff.staffName,
    staff.status,
    ...DAYS.map((day) => formatDayCell(staff.week[day])),
    staff.updatedAt,
  ];
}

export async function readAllAvailability(): Promise<StaffAvailability[]> {
  return readRows();
}

export async function readStaffAvailability(
  name: string
): Promise<StaffAvailability | null> {
  const normalized = name.trim().toLowerCase();
  const rows = await readRows();
  return rows.find((r) => r.staffName.trim().toLowerCase() === normalized) ?? null;
}

export async function saveStaffAvailability(
  name: string,
  week: WeekAvailability
): Promise<void> {
  const staffName = name.trim();
  const normalized = staffName.toLowerCase();
  const now = formatMelbourneTimestamp(new Date());

  const others = (await readRows()).filter(
    (r) => r.staffName.trim().toLowerCase() !== normalized
  );

  const mine: StaffAvailability = {
    staffName,
    status: summarizeWeek(week),
    updatedAt: now,
    week,
  };

  const merged = [...others, mine].sort((a, b) =>
    a.staffName.localeCompare(b.staffName)
  );

  const values = [HEADER, ...merged.map((r, i) => toRow(i + 1, r))];

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
