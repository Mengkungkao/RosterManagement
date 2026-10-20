// Pay settings, stored as "Setting | Value" rows in the Settings sheet tab.
// Pure parsing/validation here; reading and writing the tab is in settings-sheet.ts.

import {
  AWARD_LEVELS,
  AWARD_LEVEL_NAMES,
  type AwardLevel,
  DEFAULT_AWARD_RATES,
  DEFAULT_EVENING_LOADING,
  DEFAULT_NIGHT_LOADING,
} from "./award";
import { isValidDate, normalizeDate } from "./dates";

export interface PaySettings {
  fortnightStart: string; // any date a pay fortnight starts on (YYYY-MM-DD)
  publicHolidays: string[]; // YYYY-MM-DD
  awardRates: Record<AwardLevel, number>; // full-time/part-time minimum hourly rate per level
  eveningLoading: number; // $ per hour or part, Mon–Fri 7pm–midnight
  nightLoading: number; // $ per hour or part, Mon–Fri midnight–7am
}

export const DEFAULT_SETTINGS: PaySettings = {
  fortnightStart: "2026-01-05", // a Monday
  publicHolidays: [],
  awardRates: { ...DEFAULT_AWARD_RATES },
  eveningLoading: DEFAULT_EVENING_LOADING,
  nightLoading: DEFAULT_NIGHT_LOADING,
};

const FORTNIGHT = "Fortnight starts on";
const HOLIDAYS = "Public holidays";
const EVENING = "Evening loading (Mon-Fri 7pm-midnight)";
const NIGHT = "Night loading (Mon-Fri midnight-7am)";
const rateLabel = (level: AwardLevel) => `Award rate ${AWARD_LEVEL_NAMES[level]}`;

const MAX_RATE = 500;

function parseMoney(value: string | undefined, fallback: number): number {
  const amount = Number((value ?? "").replace(/^\$/, ""));
  return value && Number.isFinite(amount) && amount > 0 && amount <= MAX_RATE ? amount : fallback;
}

function parseDateList(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map(normalizeDate).filter(Boolean))].sort();
}

// Unknown or unreadable values fall back to the defaults, so a typo in the
// sheet never stops the roster from loading. Rows from older versions
// (Saturday/Sunday multipliers) are ignored.
export function parseSettingsRows(rows: string[][]): PaySettings {
  const values = new Map<string, string>();
  for (const [key, value] of rows) {
    if (key) values.set(key.trim().toLowerCase(), String(value ?? "").trim());
  }
  const get = (label: string) => values.get(label.toLowerCase());

  return {
    fortnightStart: normalizeDate(get(FORTNIGHT) ?? "") || DEFAULT_SETTINGS.fortnightStart,
    publicHolidays: parseDateList(get(HOLIDAYS) ?? ""),
    awardRates: Object.fromEntries(
      AWARD_LEVELS.map((level) => [level, parseMoney(get(rateLabel(level)), DEFAULT_AWARD_RATES[level])])
    ) as Record<AwardLevel, number>,
    eveningLoading: parseMoney(get(EVENING), DEFAULT_EVENING_LOADING),
    nightLoading: parseMoney(get(NIGHT), DEFAULT_NIGHT_LOADING),
  };
}

export function settingsToRows(settings: PaySettings): string[][] {
  return [
    ["Setting", "Value"],
    [FORTNIGHT, settings.fortnightStart],
    [HOLIDAYS, settings.publicHolidays.join(", ")],
    ...AWARD_LEVELS.map((level) => [rateLabel(level), String(settings.awardRates[level])]),
    [EVENING, String(settings.eveningLoading)],
    [NIGHT, String(settings.nightLoading)],
  ];
}

function money(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_RATE ? Math.round(amount * 100) / 100 : null;
}

// Validates settings sent from the Wages page. Returns an error message or the settings.
export function parseSettingsInput(body: unknown): PaySettings | string {
  if (typeof body !== "object" || body === null) return "Invalid settings";
  const input = body as Record<string, unknown>;

  const fortnightStart = typeof input.fortnightStart === "string" ? input.fortnightStart.trim() : "";
  if (!isValidDate(fortnightStart)) return "Fortnight start must be a date";

  const holidays = Array.isArray(input.publicHolidays) ? input.publicHolidays : [];
  if (!holidays.every((d) => typeof d === "string" && isValidDate(d))) {
    return "Public holidays must be dates";
  }

  const rates = (input.awardRates ?? {}) as Record<string, unknown>;
  const awardRates = {} as Record<AwardLevel, number>;
  for (const level of AWARD_LEVELS) {
    const rate = money(rates[level]);
    if (rate === null) return `${AWARD_LEVEL_NAMES[level]} rate must be a dollar amount`;
    awardRates[level] = rate;
  }
  const eveningLoading = money(input.eveningLoading);
  const nightLoading = money(input.nightLoading);
  if (eveningLoading === null || nightLoading === null) return "Loadings must be dollar amounts";

  return {
    fortnightStart,
    publicHolidays: [...new Set(holidays as string[])].sort(),
    awardRates,
    eveningLoading,
    nightLoading,
  };
}
