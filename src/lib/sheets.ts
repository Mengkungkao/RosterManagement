import { timingSafeEqual } from "crypto";
import { DAYS, WeekAvailability, emptyWeek, summarizeWeek } from "./availability";
import {
  columnLetter,
  formatMelbourneTimestamp,
  getSheetId,
  getSheetsClient,
} from "./google-client";

const LEADING_HEADERS = ["No", "Name", "Status"];
// Password is appended at the end (not inserted into the leading columns) so that
// rows written before this feature existed still parse correctly by position —
// they simply have no Password cell, which reads back as "" (unprotected).
const HEADER = [...LEADING_HEADERS, ...DAYS, "Last Updated", "Password"];
const FIRST_DAY_COLUMN = LEADING_HEADERS.length; // 0-based index of Monday's column
const UPDATED_AT_COLUMN = FIRST_DAY_COLUMN + DAYS.length; // 0-based index of Last Updated
const PASSWORD_COLUMN = UPDATED_AT_COLUMN + 1; // 0-based index of Password

// Public shape — never carries the raw password, so it's safe to pass to client components.
export interface StaffAvailability {
  staffName: string;
  status: string;
  week: WeekAvailability;
  updatedAt: string;
  hasPassword: boolean;
}

// Internal shape used only for password verification / claiming. Never returned to callers outside this file.
interface RawStaffRow {
  staffName: string;
  password: string;
  status: string;
  week: WeekAvailability;
  updatedAt: string;
}

function passwordsMatch(input: string, stored: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

async function readRawRows(): Promise<RawStaffRow[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!A2:${columnLetter(HEADER.length - 1)}`,
  });
  const rows = res.data.values || [];

  // Kept in whatever order the sheet has them in — no alphabetical resort —
  // so rows stay where whoever maintains the sheet put them.
  return rows.filter((r) => r[1]).map((r) => {
    const week = emptyWeek();
    DAYS.forEach((day, i) => {
      week[day] = parseDayCell(String(r[FIRST_DAY_COLUMN + i] ?? ""));
    });
    return {
      staffName: String(r[1]),
      status: String(r[2] || summarizeWeek(week)),
      updatedAt: String(r[UPDATED_AT_COLUMN] || ""),
      password: String(r[PASSWORD_COLUMN] || ""),
      week,
    };
  });
}

function toRow(no: number, staff: RawStaffRow): (string | number)[] {
  return [
    no,
    staff.staffName,
    staff.status,
    ...DAYS.map((day) => formatDayCell(staff.week[day])),
    staff.updatedAt,
    staff.password,
  ];
}

function toPublic(row: RawStaffRow): StaffAvailability {
  return {
    staffName: row.staffName,
    status: row.status,
    week: row.week,
    updatedAt: row.updatedAt,
    hasPassword: row.password.trim() !== "",
  };
}

export async function readAllAvailability(): Promise<StaffAvailability[]> {
  const rows = await readRawRows();
  return rows.map(toPublic);
}

export async function readStaffAvailability(
  name: string
): Promise<StaffAvailability | null> {
  const normalized = name.trim().toLowerCase();
  const rows = await readRawRows();
  const row = rows.find((r) => r.staffName.trim().toLowerCase() === normalized);
  return row ? toPublic(row) : null;
}

export interface PasswordCheckResult {
  ok: boolean;
  found: boolean;
  week: WeekAvailability;
  updatedAt: string | null;
}

// Verifies a password against an already-protected entry. Never call this for
// an entry that has no password yet — use saveStaffAvailability to claim it instead.
export async function verifyStaffPassword(
  name: string,
  password: string
): Promise<PasswordCheckResult> {
  const normalized = name.trim().toLowerCase();
  const rows = await readRawRows();
  const row = rows.find((r) => r.staffName.trim().toLowerCase() === normalized);

  if (!row || row.password.trim() === "") {
    return { ok: false, found: row !== undefined, week: emptyWeek(), updatedAt: null };
  }

  const ok = passwordsMatch(password, row.password.trim());
  return ok
    ? { ok: true, found: true, week: row.week, updatedAt: row.updatedAt }
    : { ok: false, found: true, week: emptyWeek(), updatedAt: null };
}

// Existing staff keep their current row (updated in place); a name that isn't
// already there is a new staff member and goes on the bottom — never
// resorted alphabetically, so the sheet's row order stays whatever whoever
// maintains it set it to.
function upsertRow(rows: RawStaffRow[], mine: RawStaffRow): RawStaffRow[] {
  const normalized = mine.staffName.trim().toLowerCase();
  const index = rows.findIndex((r) => r.staffName.trim().toLowerCase() === normalized);
  if (index === -1) return [...rows, mine];
  const next = [...rows];
  next[index] = mine;
  return next;
}

async function writeRows(rows: RawStaffRow[]): Promise<void> {
  const values = [HEADER, ...rows.map((r, i) => toRow(i + 1, r))];

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

export async function saveStaffAvailability(
  name: string,
  week: WeekAvailability,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const staffName = name.trim();
  const normalized = staffName.toLowerCase();
  const now = formatMelbourneTimestamp(new Date());

  const rows = await readRawRows();
  const existing = rows.find((r) => r.staffName.trim().toLowerCase() === normalized);

  const existingPassword = existing?.password.trim() ?? "";
  if (existingPassword !== "") {
    if (!passwordsMatch(password, existingPassword)) {
      return { ok: false, error: "Incorrect password" };
    }
  } else if (password.trim() === "") {
    return { ok: false, error: "A password is required" };
  }

  const finalPassword = existingPassword !== "" ? existingPassword : password.trim();

  const mine: RawStaffRow = {
    staffName,
    password: finalPassword,
    status: summarizeWeek(week),
    updatedAt: now,
    week,
  };

  await writeRows(upsertRow(rows, mine));

  return { ok: true };
}

// Logs a staff member in without touching their availability data: verifies
// their password if they already have one, or claims `password` as theirs if
// they don't yet (new name, or a legacy row from before passwords existed).
// Used by features other than the availability form itself (e.g. Today's
// Events) that still need to authenticate as a specific staff member.
export async function claimOrVerifyStaffPassword(
  name: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const staffName = name.trim();
  const normalized = staffName.toLowerCase();

  const rows = await readRawRows();
  const existing = rows.find((r) => r.staffName.trim().toLowerCase() === normalized);
  const existingPassword = existing?.password.trim() ?? "";

  if (existingPassword !== "") {
    if (!passwordsMatch(password, existingPassword)) {
      return { ok: false, error: "Incorrect password" };
    }
    return { ok: true };
  }

  if (password.trim() === "") {
    return { ok: false, error: "A password is required" };
  }

  const week = existing?.week ?? emptyWeek();
  const mine: RawStaffRow = {
    staffName,
    password: password.trim(),
    status: existing?.status ?? summarizeWeek(week),
    updatedAt: existing?.updatedAt ?? formatMelbourneTimestamp(new Date()),
    week,
  };

  await writeRows(upsertRow(rows, mine));

  return { ok: true };
}
