import { google } from "googleapis";
import { DAYS, Day, WeekAvailability, emptyWeek } from "./availability";

const HEADER = ["Staff Name", "Day", "Status", "Start Time", "End Time", "Updated At"];

export interface StaffAvailability {
  staffName: string;
  week: WeekAvailability;
  updatedAt: string;
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_TAB || "Availability";
}

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set"
    );
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

interface RawRow {
  staffName: string;
  day: Day;
  status: string;
  startTime: string;
  endTime: string;
  updatedAt: string;
}

async function readRawRows(): Promise<RawRow[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${getSheetName()}!A2:F`,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      staffName: String(r[0]),
      day: String(r[1]) as Day,
      status: String(r[2] || "unavailable"),
      startTime: String(r[3] || ""),
      endTime: String(r[4] || ""),
      updatedAt: String(r[5] || ""),
    }));
}

function groupByStaff(rows: RawRow[]): StaffAvailability[] {
  const byStaff = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = row.staffName.trim();
    if (!byStaff.has(key)) byStaff.set(key, []);
    byStaff.get(key)!.push(row);
  }

  return Array.from(byStaff.entries())
    .map(([staffName, staffRows]) => {
      const week = emptyWeek();
      let updatedAt = "";
      for (const row of staffRows) {
        if (!DAYS.includes(row.day)) continue;
        week[row.day] = {
          status:
            row.status === "available_all_day" || row.status === "custom"
              ? row.status
              : "unavailable",
          startTime: row.startTime,
          endTime: row.endTime,
        };
        if (row.updatedAt > updatedAt) updatedAt = row.updatedAt;
      }
      return { staffName, week, updatedAt };
    })
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}

export async function readAllAvailability(): Promise<StaffAvailability[]> {
  return groupByStaff(await readRawRows());
}

export async function readStaffAvailability(
  name: string
): Promise<StaffAvailability | null> {
  const normalized = name.trim().toLowerCase();
  const rows = (await readRawRows()).filter(
    (r) => r.staffName.trim().toLowerCase() === normalized
  );
  if (rows.length === 0) return null;
  return groupByStaff(rows)[0];
}

export async function saveStaffAvailability(
  name: string,
  week: WeekAvailability
): Promise<void> {
  const staffName = name.trim();
  const normalized = staffName.toLowerCase();
  const now = new Date().toISOString();

  const others = (await readRawRows()).filter(
    (r) => r.staffName.trim().toLowerCase() !== normalized
  );

  const mine: RawRow[] = DAYS.map((day) => {
    const d = week[day];
    return {
      staffName,
      day,
      status: d.status,
      startTime: d.status === "custom" ? d.startTime : "",
      endTime: d.status === "custom" ? d.endTime : "",
      updatedAt: now,
    };
  });

  const merged = [...others, ...mine].sort((a, b) => {
    const staffCompare = a.staffName.localeCompare(b.staffName);
    if (staffCompare !== 0) return staffCompare;
    return DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
  });

  const values = [
    HEADER,
    ...merged.map((r) => [
      r.staffName,
      r.day,
      r.status,
      r.startTime,
      r.endTime,
      r.updatedAt,
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
