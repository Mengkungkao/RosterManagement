import { promises as fs } from "fs";
import { getSheetId, getSheetsClient } from "./google-client";

// Every read and write of the spreadsheet goes through this small interface.
// Production uses Google Sheets; tests and offline demos use MemoryStore
// (optionally saved to a JSON file — see ROSTER_LOCAL_DATA in the README).

export type Cell = string | number;

export interface TableStore {
  // Every row of the tab, header included, as strings. A missing tab reads as [].
  read(tab: string): Promise<string[][]>;
  // Several tabs in one request (Google Sheets allows few requests a minute).
  // A missing tab reads as null, so callers can tell "not created yet" from empty.
  readMany(tabs: string[]): Promise<(string[][] | null)[]>;
  // Replaces the whole tab in a single write. Rows the old content had beyond
  // the new content are blanked in that same write — nothing is cleared first,
  // so a failed write leaves the old data in place.
  writeAll(tab: string, rows: Cell[][]): Promise<void>;
  // Overwrites one row (1-based, header is row 1), leaving every other row alone.
  writeRow(tab: string, rowNumber: number, row: Cell[]): Promise<void>;
  // Adds a row after the last one without touching existing rows.
  appendRow(tab: string, row: Cell[]): Promise<void>;
}

// Pads `rows` so they cover every cell the old content used, so one write
// both writes the new values and blanks whatever is left of the old ones.
export function coverOldContent(old: string[][], rows: Cell[][]): Cell[][] {
  const width = Math.max(0, ...old.map((r) => r.length), ...rows.map((r) => r.length));
  const height = Math.max(old.length, rows.length);
  return Array.from({ length: height }, (_, i) => {
    const row = rows[i] ?? [];
    return [...row, ...Array(width - row.length).fill("")];
  });
}

function a1(tab: string, range?: string): string {
  const quoted = `'${tab.replace(/'/g, "''")}'`;
  return range ? `${quoted}!${range}` : quoted;
}

function isMissingTab(err: unknown): boolean {
  return err instanceof Error && /Unable to parse range/i.test(err.message);
}

class GoogleSheetsStore implements TableStore {
  async read(tab: string): Promise<string[][]> {
    const sheets = await getSheetsClient();
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: a1(tab),
      });
      return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
    } catch (err) {
      if (isMissingTab(err)) return [];
      throw err;
    }
  }

  async readMany(tabs: string[]): Promise<(string[][] | null)[]> {
    const sheets = await getSheetsClient();
    try {
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: getSheetId(),
        ranges: tabs.map((tab) => a1(tab)),
      });
      const ranges = res.data.valueRanges ?? [];
      return tabs.map((_, i) => (ranges[i]?.values ?? []).map((row) => row.map((cell) => String(cell ?? ""))));
    } catch (err) {
      // One missing tab fails the whole batch: read them one by one instead.
      if (!isMissingTab(err)) throw err;
      return Promise.all(
        tabs.map(async (tab) => {
          try {
            const res = await sheets.spreadsheets.values.get({ spreadsheetId: getSheetId(), range: a1(tab) });
            return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
          } catch (e) {
            if (isMissingTab(e)) return null;
            throw e;
          }
        })
      );
    }
  }

  // Runs `write`; if the tab doesn't exist yet, creates it and tries once more.
  private async withTab(tab: string, write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (err) {
      if (!isMissingTab(err)) throw err;
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getSheetId(),
        requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
      });
      await write();
    }
  }

  async writeAll(tab: string, rows: Cell[][]): Promise<void> {
    const values = coverOldContent(await this.read(tab), rows);
    const sheets = await getSheetsClient();
    await this.withTab(tab, () =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: a1(tab, "A1"),
        valueInputOption: "RAW",
        requestBody: { values },
      })
    );
  }

  async writeRow(tab: string, rowNumber: number, row: Cell[]): Promise<void> {
    const sheets = await getSheetsClient();
    await this.withTab(tab, () =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: a1(tab, `A${rowNumber}`),
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      })
    );
  }

  async appendRow(tab: string, row: Cell[]): Promise<void> {
    const sheets = await getSheetsClient();
    await this.withTab(tab, () =>
      sheets.spreadsheets.values.append({
        spreadsheetId: getSheetId(),
        range: a1(tab, "A1"),
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      })
    );
  }
}

// Tabs held in memory, and saved to `file` after every write when one is given.
export class MemoryStore implements TableStore {
  private tabs: Record<string, string[][]> = {};

  constructor(private readonly file?: string) {}

  // Re-reads the file every time: Next.js may load this module more than once
  // (pages and API routes), and each copy must see the others' writes.
  private async load() {
    if (!this.file) return;
    try {
      this.tabs = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.tabs = {};
    }
  }

  private async save() {
    if (this.file) await fs.writeFile(this.file, JSON.stringify(this.tabs, null, 1));
  }

  async read(tab: string): Promise<string[][]> {
    await this.load();
    // Like Google Sheets: trailing empty cells and rows are not returned.
    const rows = (this.tabs[tab] ?? []).map((row) => {
      const copy = [...row];
      while (copy.length && copy[copy.length - 1] === "") copy.pop();
      return copy;
    });
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    return rows;
  }

  async readMany(tabs: string[]): Promise<(string[][] | null)[]> {
    await this.load();
    const present = tabs.map((tab) => tab in this.tabs);
    const rows = await Promise.all(tabs.map((tab) => this.read(tab)));
    return rows.map((r, i) => (present[i] ? r : null));
  }

  async writeAll(tab: string, rows: Cell[][]): Promise<void> {
    await this.load();
    this.tabs[tab] = coverOldContent(this.tabs[tab] ?? [], rows).map((r) => r.map(String));
    await this.save();
  }

  async writeRow(tab: string, rowNumber: number, row: Cell[]): Promise<void> {
    await this.load();
    const rows = (this.tabs[tab] ??= []);
    while (rows.length < rowNumber) rows.push([]);
    rows[rowNumber - 1] = row.map(String);
    await this.save();
  }

  async appendRow(tab: string, row: Cell[]): Promise<void> {
    const rows = await this.read(tab);
    this.tabs[tab] = [...rows, row.map(String)];
    await this.save();
  }
}

let override: TableStore | null = null;
let fileStore: MemoryStore | null = null;
const googleStore = new GoogleSheetsStore();

export function setStoreForTesting(store: TableStore | null) {
  override = store;
}

export function getStore(): TableStore {
  if (override) return override;
  const file = process.env.ROSTER_LOCAL_DATA;
  if (file) return (fileStore ??= new MemoryStore(file));
  return googleStore;
}

export type TabKind = "staff" | "events" | "roster" | "settings" | "taskTypes" | "skills" | "templates";

export function tabName(kind: TabKind): string {
  switch (kind) {
    case "staff":
      return process.env.GOOGLE_SHEET_TAB || "Availability";
    case "events":
      return process.env.GOOGLE_EVENTS_SHEET_TAB || "Events";
    case "roster":
      return process.env.GOOGLE_ROSTER_SHEET_TAB || "Roster";
    case "settings":
      return process.env.GOOGLE_SETTINGS_SHEET_TAB || "Settings";
    case "taskTypes":
      return process.env.GOOGLE_TASK_TYPES_SHEET_TAB || "Task Types";
    case "skills":
      return process.env.GOOGLE_SKILLS_SHEET_TAB || "Skills";
    case "templates":
      return process.env.GOOGLE_TEMPLATES_SHEET_TAB || "Templates";
  }
}

// Runs `fn` after every earlier `withLock` call for the same key has finished,
// so a read → change → write of one tab never interleaves with another in this
// server process. (It can't stop a second server or someone typing in the
// sheet; the events' revision numbers catch those.)
const locks = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const settled = run.catch(() => undefined);
  locks.set(key, settled);
  settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
}
