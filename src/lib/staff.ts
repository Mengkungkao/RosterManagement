import { randomUUID } from "crypto";
import { DAYS, type DayAvailability, type WeekAvailability, emptyWeek, summarizeWeek } from "./availability";
import { melbourneTimestamp } from "./dates";
import { AWARD_LEVEL_NAMES, type AwardLevel, parseAwardLevel } from "./award";
import { EMPLOYMENT_LABELS, type EmploymentType, parseEmploymentType } from "./employment";
import { hashPassword, isHashed, verifyPassword } from "./passwords";
import {
  type Restriction,
  type ShiftPreference,
  type StaffRequest,
  formatPreferencesCell,
  formatRequestsCell,
  formatRestrictionsCell,
  parsePreferencesCell,
  parseRequestsCell,
  parseRestrictionsCell,
} from "./profile";
import { type StaffSkills, formatSkillsCell, parseSkillsCell } from "./skills";
import { getStore, tabName, withLock } from "./store";

// The staff tab (default name "Availability"): one row per staff member.
// New columns are only ever added at the end, so rows written by older
// versions still read correctly by position.
const LEADING_HEADERS = ["No", "Name", "Status"];
const HEADER = [
  ...LEADING_HEADERS,
  ...DAYS,
  "Last Updated",
  "Password",
  "Type",
  "Hourly Rate",
  "Award Level",
  "Employee ID",
  "Active",
  "Skills",
  "Restrictions",
  "Preferences",
  "Requests",
  "Manager Notes",
];
const FIRST_DAY_COLUMN = LEADING_HEADERS.length;
const UPDATED_AT_COLUMN = FIRST_DAY_COLUMN + DAYS.length;
const PASSWORD_COLUMN = UPDATED_AT_COLUMN + 1;
const TYPE_COLUMN = PASSWORD_COLUMN + 1;
// No longer used (pay now follows the award level) but kept as it is in the sheet.
const OLD_RATE_COLUMN = TYPE_COLUMN + 1;
const LEVEL_COLUMN = OLD_RATE_COLUMN + 1;
const EMPLOYEE_ID_COLUMN = LEVEL_COLUMN + 1;
const ACTIVE_COLUMN = EMPLOYEE_ID_COLUMN + 1;
const SKILLS_COLUMN = ACTIVE_COLUMN + 1;
const RESTRICTIONS_COLUMN = SKILLS_COLUMN + 1;
const PREFERENCES_COLUMN = RESTRICTIONS_COLUMN + 1;
const REQUESTS_COLUMN = PREFERENCES_COLUMN + 1;
const NOTES_COLUMN = REQUESTS_COLUMN + 1;
export const MAX_NOTES_LENGTH = 2000;

export const MAX_NAME_LENGTH = 100;

type Outcome = { ok: boolean; error?: string };

// Sent to admin pages only: never carries the password itself. Staff-facing
// pages get their own, smaller responses.
export interface StaffMember {
  staffName: string;
  status: string;
  week: WeekAvailability;
  updatedAt: string;
  hasPassword: boolean;
  passwordIsPlainText: boolean; // an old row: secure it from the Staff page
  employmentType: EmploymentType;
  awardLevel: AwardLevel | null;
  employeeId: string;
  active: boolean;
  skills: StaffSkills;
  restrictions: Restriction[]; // admin-only
  preferences: ShiftPreference[];
  requests: StaffRequest[];
  notes: string; // manager notes and development — admin-only
  unreadable: string[]; // cells that couldn't be read ("Skills", …) — kept as they are in the sheet
}

interface StaffRow extends Omit<StaffMember, "hasPassword" | "passwordIsPlainText"> {
  rowNumber: number | null; // null = not in the sheet yet
  no: string;
  password: string; // a hash, or plain text in rows from older versions
  oldRate: string;
  raw: { skills: string; restrictions: string; requests: string };
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

function parseRow(r: string[], rowNumber: number): StaffRow {
  const week = emptyWeek();
  DAYS.forEach((day, d) => {
    week[day] = parseDayCell(r[FIRST_DAY_COLUMN + d] ?? "");
  });
  const raw = {
    skills: r[SKILLS_COLUMN] ?? "",
    restrictions: r[RESTRICTIONS_COLUMN] ?? "",
    requests: r[REQUESTS_COLUMN] ?? "",
  };
  const skills = parseSkillsCell(raw.skills);
  const restrictions = parseRestrictionsCell(raw.restrictions);
  const requests = parseRequestsCell(raw.requests);
  const unreadable = [
    ...(skills === null ? ["Skills"] : []),
    ...(restrictions === null ? ["Restrictions"] : []),
    ...(requests === null ? ["Requests"] : []),
  ];
  return {
    rowNumber,
    no: r[0] ?? "",
    staffName: r[1].trim(),
    status: r[2] || summarizeWeek(week),
    week,
    updatedAt: r[UPDATED_AT_COLUMN] ?? "",
    password: (r[PASSWORD_COLUMN] ?? "").trim(),
    employmentType: parseEmploymentType(r[TYPE_COLUMN] ?? ""),
    oldRate: r[OLD_RATE_COLUMN] ?? "",
    awardLevel: parseAwardLevel(r[LEVEL_COLUMN] ?? ""),
    employeeId: (r[EMPLOYEE_ID_COLUMN] ?? "").trim(),
    active: !/^(no|n|false|0|inactive)$/i.test((r[ACTIVE_COLUMN] ?? "").trim()),
    skills: skills ?? {},
    restrictions: restrictions ?? [],
    preferences: parsePreferencesCell(r[PREFERENCES_COLUMN] ?? ""),
    requests: requests ?? [],
    notes: r[NOTES_COLUMN] ?? "",
    unreadable,
    raw,
  };
}

// Kept in the sheet's own order — never re-sorted — so rows stay where
// whoever maintains the sheet put them.
function parseRows(rows: string[][]): StaffRow[] {
  return rows.slice(1).flatMap((r, i) => (r[1]?.trim() ? [parseRow(r, i + 2)] : []));
}

async function readRows(): Promise<StaffRow[]> {
  return parseRows(await getStore().read(tabName("staff")));
}

function toPublic(row: StaffRow): StaffMember {
  const { rowNumber: _r, no: _n, password, oldRate: _o, raw: _raw, ...rest } = row;
  return { ...rest, hasPassword: password !== "", passwordIsPlainText: password !== "" && !isHashed(password) };
}

export function parseStaffRows(rows: string[][]): StaffMember[] {
  return parseRows(rows).map(toPublic);
}

// Writes only this person's row (or appends a new one), so two people saving
// at the same time can't overwrite each other. Cells that couldn't be read
// are written back exactly as they were.
async function saveRow(row: StaffRow, existingCount: number): Promise<void> {
  const store = getStore();
  const tab = tabName("staff");
  const header = (await store.read(tab))[0] ?? [];
  if (HEADER.some((title, i) => header[i] !== title)) await store.writeRow(tab, 1, HEADER);

  const unreadable = (cell: string) => row.unreadable.includes(cell);
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
    row.employeeId,
    row.active ? "" : "Inactive",
    unreadable("Skills") ? row.raw.skills : formatSkillsCell(row.skills),
    unreadable("Restrictions") ? row.raw.restrictions : formatRestrictionsCell(row.restrictions),
    formatPreferencesCell(row.preferences),
    unreadable("Requests") ? row.raw.requests : formatRequestsCell(row.requests),
    row.notes,
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
    employeeId: "",
    active: true,
    skills: {},
    restrictions: [],
    preferences: [],
    requests: [],
    notes: "",
    unreadable: [],
    raw: { skills: "", restrictions: "", requests: "" },
  };
}

// Read → change → write of one person's row, holding the staff tab's lock.
async function changeRow<T>(
  name: string,
  change: (row: StaffRow | undefined, rows: StaffRow[]) => Promise<{ row?: StaffRow; result: T }>
): Promise<T> {
  return withLock(tabName("staff"), async () => {
    const rows = await readRows();
    const existing = rows.find((r) => normalize(r.staffName) === normalize(name));
    const { row, result } = await change(existing, rows);
    if (row) await saveRow(row, rows.length);
    return result;
  });
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

// A plain-text password that just matched is replaced with its hash.
async function securedPassword(row: StaffRow, password: string): Promise<string | null> {
  return isHashed(row.password) ? null : hashPassword(password.trim());
}

// Checks the password of an entry that already has one. Entries without a
// password are claimed through saveStaffAvailability / claimOrVerifyStaffPassword.
export async function verifyStaffPassword(name: string, password: string): Promise<PasswordCheckResult> {
  return changeRow<PasswordCheckResult>(name, async (row) => {
    if (!row || row.password === "" || !(await verifyPassword(password.trim(), row.password))) {
      return { result: { ok: false, week: emptyWeek() } };
    }
    const hash = await securedPassword(row, password);
    return { row: hash ? { ...row, password: hash } : undefined, result: { ok: true, week: row.week } };
  });
}

export async function saveStaffAvailability(
  name: string,
  week: WeekAvailability,
  password: string
): Promise<Outcome> {
  return changeRow<Outcome>(name, async (existing) => {
    const row = existing ?? newRow(name.trim());
    let stored = row.password;
    if (row.password !== "") {
      if (!(await verifyPassword(password.trim(), row.password))) return { result: { ok: false, error: "Incorrect password" } };
      stored = (await securedPassword(row, password)) ?? row.password;
    } else if (password.trim() === "") {
      return { result: { ok: false, error: "A password is required" } };
    } else {
      stored = await hashPassword(password.trim());
    }
    return {
      row: { ...row, password: stored, week, status: summarizeWeek(week), updatedAt: melbourneTimestamp() },
      result: { ok: true },
    };
  });
}

// Logs a staff member in without touching their availability: checks their
// password, or claims `password` as theirs if they don't have one yet.
export async function claimOrVerifyStaffPassword(
  name: string,
  password: string
): Promise<Outcome> {
  return changeRow<Outcome>(name, async (existing) => {
    if (existing && existing.password !== "") {
      if (!(await verifyPassword(password.trim(), existing.password))) {
        return { result: { ok: false, error: "Incorrect password" } };
      }
      const hash = await securedPassword(existing, password);
      return { row: hash ? { ...existing, password: hash } : undefined, result: { ok: true } };
    }
    if (password.trim() === "") return { result: { ok: false, error: "A password is required" } };
    const row = existing ?? { ...newRow(name.trim()), updatedAt: melbourneTimestamp() };
    return { row: { ...row, password: await hashPassword(password.trim()) }, result: { ok: true } };
  });
}

// --- Requests from staff --------------------------------------------------------

export async function addStaffRequest(
  name: string,
  request: Pick<StaffRequest, "kind" | "from" | "to" | "eventId" | "eventName" | "note">
): Promise<Outcome> {
  return changeRow<Outcome>(name, async (row) => {
    if (!row) return { result: { ok: false, error: "Staff member not found" } };
    if (row.unreadable.includes("Requests")) {
      return { result: { ok: false, error: "Your requests can't be saved right now — please tell your manager" } };
    }
    const entry: StaffRequest = {
      ...request,
      id: randomUUID().slice(0, 8),
      status: "pending",
      submitted: melbourneTimestamp(),
      decided: "",
    };
    return { row: { ...row, requests: [...row.requests, entry] }, result: { ok: true } };
  });
}

export async function withdrawStaffRequest(name: string, id: string): Promise<Outcome> {
  return changeRow<Outcome>(name, async (row) => {
    const request = row?.requests.find((r) => r.id === id);
    if (!row || !request) return { result: { ok: false, error: "Request not found" } };
    if (request.status !== "pending") return { result: { ok: false, error: "That request has already been answered" } };
    return {
      row: { ...row, requests: row.requests.map((r) => (r.id === id ? { ...r, status: "withdrawn" as const } : r)) },
      result: { ok: true },
    };
  });
}

// --- Admin -------------------------------------------------------------------

export async function addStaff(
  name: string,
  employmentType: EmploymentType,
  awardLevel: AwardLevel | null
): Promise<Outcome> {
  return changeRow<Outcome>(name, async (existing) => {
    if (existing) return { result: { ok: false, error: `${name.trim()} is already on the staff list` } };
    return { row: { ...newRow(name.trim()), employmentType, awardLevel }, result: { ok: true } };
  });
}

export interface StaffChanges {
  employmentType?: EmploymentType;
  awardLevel?: AwardLevel | null;
  resetPassword?: boolean;
  employeeId?: string;
  active?: boolean;
  skills?: StaffSkills;
  restrictions?: Restriction[];
  preferences?: ShiftPreference[];
  notes?: string;
  requestDecision?: { id: string; status: "approved" | "declined" | "resolved" };
}

export async function updateStaff(
  name: string,
  changes: StaffChanges
): Promise<Outcome> {
  return changeRow<Outcome>(name, async (row, rows) => {
    if (!row) return { result: { ok: false, error: "Staff member not found" } };
    const blocked = (
      [
        ["Skills", changes.skills],
        ["Restrictions", changes.restrictions],
        ["Requests", changes.requestDecision],
      ] as const
    ).find(([cell, change]) => change !== undefined && row.unreadable.includes(cell));
    if (blocked) {
      return {
        result: {
          ok: false,
          error: `${row.staffName}'s ${blocked[0]} cell in the sheet can't be read. Fix or clear it in the sheet first, so nothing in it is lost.`,
        },
      };
    }
    if (changes.employeeId) {
      const other = rows.find(
        (r) => r !== row && r.employeeId && r.employeeId.toLowerCase() === changes.employeeId!.toLowerCase()
      );
      if (other) return { result: { ok: false, error: `Employee ID ${changes.employeeId} is already ${other.staffName}'s` } };
    }
    let requests = row.requests;
    if (changes.requestDecision) {
      const { id, status } = changes.requestDecision;
      if (!requests.some((r) => r.id === id)) return { result: { ok: false, error: "Request not found" } };
      requests = requests.map((r) => (r.id === id ? { ...r, status, decided: melbourneTimestamp() } : r));
    }
    return {
      row: {
        ...row,
        employmentType: changes.employmentType ?? row.employmentType,
        awardLevel: changes.awardLevel !== undefined ? changes.awardLevel : row.awardLevel,
        password: changes.resetPassword ? "" : row.password,
        employeeId: changes.employeeId ?? row.employeeId,
        active: changes.active ?? row.active,
        skills: changes.skills ?? row.skills,
        restrictions: changes.restrictions ?? row.restrictions,
        preferences: changes.preferences ?? row.preferences,
        notes: changes.notes ?? row.notes,
        requests,
      },
      result: { ok: true },
    };
  });
}

// Replaces every plain-text password still in the sheet with its hash. The
// passwords keep working; they just can't be read from the sheet any more.
export async function secureAllPasswords(): Promise<number> {
  return withLock(tabName("staff"), async () => {
    const rows = await readRows();
    let count = 0;
    for (const row of rows) {
      if (row.password === "" || isHashed(row.password)) continue;
      await saveRow({ ...row, password: await hashPassword(row.password) }, rows.length);
      count++;
    }
    return count;
  });
}
