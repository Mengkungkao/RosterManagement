import { timingSafeEqual } from "crypto";
import { DAYS, type DayAvailability, type WeekAvailability, emptyWeek, summarizeWeek } from "./availability";
import { melbourneTimestamp } from "./dates";
import { AWARD_LEVEL_NAMES, type AwardLevel, parseAwardLevel } from "./award";
import { EMPLOYMENT_LABELS, type EmploymentType, parseEmploymentType } from "./employment";
import { getStore, tabName } from "./store";

// The staff tab (default name "Availability"): one row per staff member.
// New columns are only ever added at the end, so rows written by older
// versions still read correctly by position.
const LEADING_HEADERS = ["No", "Name", "Status"];
const HEADER = [...LEADING_HEADERS, ...DAYS, "Last Updated", "Password", "Type", "Hourly Rate", "Award Level"];
const FIRST_DAY_COLUMN = LEADING_HEADERS.length;
const UPDATED_AT_COLUMN = FIRST_DAY_COLUMN + DAYS.length;
const PASSWORD_COLUMN = UPDATED_AT_COLUMN + 1;
const TYPE_COLUMN = PASSWORD_COLUMN + 1;
// No longer used (pay now follows the award level) but kept as it is in the sheet.
const OLD_RATE_COLUMN = TYPE_COLUMN + 1;
const LEVEL_COLUMN = OLD_RATE_COLUMN + 1;

export const MAX_NAME_LENGTH = 100;

// Safe to send to the browser: never carries the password itself.
export interface StaffMember {
  staffName: string;
  status: string;
  week: WeekAvailability;
  updatedAt: string;
  hasPassword: boolean;
  employmentType: EmploymentType;
  awardLevel: AwardLevel | null;
}

interface StaffRow extends Omit<StaffMember, "hasPassword"> {
  rowNumber: number | null; // null = not in the sheet yet
  no: string;
  password: string;
  oldRate: string;
}

function passwordsMatch(input: string, stored: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function formatDayCell(day: DayAvailability): string {
  if (day.status === "available_all_day") return "All day";
  if (day.status === "custom") return `${day.startTime}-${day.endTime}`;
  return "Unavailable";
}

function parseDayCell(cell: string): DayAvailability {
  const trimmed = cell.trim();
  if (trimmed.toLowerCase() === "all day") {
    return { status: "available_all_day", startTime: "", endTime: "" };
  }
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
  if (match) {
    return {
      status: "custom",
      startTime: `${match[1]}:${match[2]}`,
      endTime: `${match[3]}:${match[4]}`,
    };
  }
  return { status: "unavailable", startTime: "", endTime: "" };
}

function normalize(name: string) {
  return name.trim().toLowerCase();
}

// Kept in the sheet's own order — never re-sorted — so rows stay where
// whoever maintains the sheet put them.
async function readRows(): Promise<StaffRow[]> {
  const rows = await getStore().read(tabName("staff"));
  return rows.slice(1).flatMap((r, i) => {
    if (!r[1]?.trim()) return [];
    const week = emptyWeek();
    DAYS.forEach((day, d) => {
      week[day] = parseDayCell(r[FIRST_DAY_COLUMN + d] ?? "");
    });
    return [
      {
        rowNumber: i + 2,
        no: r[0] ?? "",
        staffName: r[1].trim(),
        status: r[2] || summarizeWeek(week),
        week,
        updatedAt: r[UPDATED_AT_COLUMN] ?? "",
        password: (r[PASSWORD_COLUMN] ?? "").trim(),
        employmentType: parseEmploymentType(r[TYPE_COLUMN] ?? ""),
        oldRate: r[OLD_RATE_COLUMN] ?? "",
        awardLevel: parseAwardLevel(r[LEVEL_COLUMN] ?? ""),
      },
    ];
  });
}

function toPublic(row: StaffRow): StaffMember {
  return {
    staffName: row.staffName,
    status: row.status,
    week: row.week,
    updatedAt: row.updatedAt,
    hasPassword: row.password !== "",
    employmentType: row.employmentType,
    awardLevel: row.awardLevel,
  };
}

// Writes only this person's row (or appends a new one), so two people saving
// at the same time can't overwrite each other.
async function saveRow(row: StaffRow, existingCount: number): Promise<void> {
  const store = getStore();
  const tab = tabName("staff");
  const header = (await store.read(tab))[0] ?? [];
  if (HEADER.some((title, i) => header[i] !== title)) await store.writeRow(tab, 1, HEADER);

  const values = [
    row.rowNumber === null ? existingCount + 1 : row.no,
    row.staffName,
    row.status,
    ...DAYS.map((day) => formatDayCell(row.week[day])),
    row.updatedAt,
    row.password,
    EMPLOYMENT_LABELS[row.employmentType],
    row.oldRate,
    row.awardLevel ? AWARD_LEVEL_NAMES[row.awardLevel] : "",
  ];
  if (row.rowNumber === null) await store.appendRow(tab, values);
  else await store.writeRow(tab, row.rowNumber, values);
}

function newRow(staffName: string): StaffRow {
  const week = emptyWeek();
  return {
    rowNumber: null,
    no: "",
    staffName,
    status: summarizeWeek(week),
    week,
    updatedAt: "",
    password: "",
    employmentType: "casual",
    oldRate: "",
    awardLevel: null,
  };
}

export async function readAllStaff(): Promise<StaffMember[]> {
  return (await readRows()).map(toPublic);
}

export async function readStaff(name: string): Promise<StaffMember | null> {
  const row = (await readRows()).find((r) => normalize(r.staffName) === normalize(name));
  return row ? toPublic(row) : null;
}

export interface PasswordCheckResult {
  ok: boolean;
  week: WeekAvailability;
}

// Checks the password of an entry that already has one. Entries without a
// password are claimed through saveStaffAvailability / claimOrVerifyStaffPassword.
export async function verifyStaffPassword(name: string, password: string): Promise<PasswordCheckResult> {
  const row = (await readRows()).find((r) => normalize(r.staffName) === normalize(name));
  if (!row || row.password === "" || !passwordsMatch(password, row.password)) {
    return { ok: false, week: emptyWeek() };
  }
  return { ok: true, week: row.week };
}

export async function saveStaffAvailability(
  name: string,
  week: WeekAvailability,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const rows = await readRows();
  const existing = rows.find((r) => normalize(r.staffName) === normalize(name));
  const row = existing ?? newRow(name.trim());

  if (row.password !== "") {
    if (!passwordsMatch(password, row.password)) return { ok: false, error: "Incorrect password" };
  } else if (password.trim() === "") {
    return { ok: false, error: "A password is required" };
  }

  await saveRow(
    {
      ...row,
      password: row.password || password.trim(),
      week,
      status: summarizeWeek(week),
      updatedAt: melbourneTimestamp(),
    },
    rows.length
  );
  return { ok: true };
}

// Logs a staff member in without touching their availability: checks their
// password, or claims `password` as theirs if they don't have one yet.
export async function claimOrVerifyStaffPassword(
  name: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const rows = await readRows();
  const existing = rows.find((r) => normalize(r.staffName) === normalize(name));
  if (existing && existing.password !== "") {
    return passwordsMatch(password, existing.password)
      ? { ok: true }
      : { ok: false, error: "Incorrect password" };
  }
  if (password.trim() === "") return { ok: false, error: "A password is required" };

  const row = existing ?? { ...newRow(name.trim()), updatedAt: melbourneTimestamp() };
  await saveRow({ ...row, password: password.trim() }, rows.length);
  return { ok: true };
}

// --- Admin -------------------------------------------------------------------

export async function addStaff(
  name: string,
  employmentType: EmploymentType,
  awardLevel: AwardLevel | null
): Promise<{ ok: boolean; error?: string }> {
  const rows = await readRows();
  if (rows.some((r) => normalize(r.staffName) === normalize(name))) {
    return { ok: false, error: `${name.trim()} is already on the staff list` };
  }
  await saveRow({ ...newRow(name.trim()), employmentType, awardLevel }, rows.length);
  return { ok: true };
}

export interface StaffChanges {
  employmentType?: EmploymentType;
  awardLevel?: AwardLevel | null;
  resetPassword?: boolean;
}

export async function updateStaff(
  name: string,
  changes: StaffChanges
): Promise<{ ok: boolean; error?: string }> {
  const rows = await readRows();
  const row = rows.find((r) => normalize(r.staffName) === normalize(name));
  if (!row) return { ok: false, error: "Staff member not found" };
  await saveRow(
    {
      ...row,
      employmentType: changes.employmentType ?? row.employmentType,
      awardLevel: changes.awardLevel !== undefined ? changes.awardLevel : row.awardLevel,
      password: changes.resetPassword ? "" : row.password,
    },
    rows.length
  );
  return { ok: true };
}
