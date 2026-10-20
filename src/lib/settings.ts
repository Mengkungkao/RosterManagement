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

// How Generate roster ranks people who are all eligible (Settings →
// Matching). Safety, legal and hour rules always come first; these only
// order the people who pass them.
export interface MatchingSettings {
  preferExperienced: boolean; // experienced / qualified staff first for skilled tasks
  usePreferences: boolean; // people who prefer that kind of shift first
  keepTogether: boolean; // people already working the event first
}

export const DEFAULT_MATCHING: MatchingSettings = {
  preferExperienced: true,
  usePreferences: true,
  keepTogether: true,
};

export interface PaySettings {
  fortnightStart: string; // any date a pay fortnight starts on (YYYY-MM-DD)
  publicHolidays: string[]; // YYYY-MM-DD
  awardRates: Record<AwardLevel, number>; // full-time/part-time minimum hourly rate per level
  eveningLoading: number; // $ per hour or part, Mon–Fri 7pm–midnight
  nightLoading: number; // $ per hour or part, Mon–Fri midnight–7am
  matching: MatchingSettings;
}

export const DEFAULT_SETTINGS: PaySettings = {
  fortnightStart: "2026-01-05", // a Monday
  publicHolidays: [],
  awardRates: { ...DEFAULT_AWARD_RATES },
  eveningLoading: DEFAULT_EVENING_LOADING,
  nightLoading: DEFAULT_NIGHT_LOADING,
  matching: DEFAULT_MATCHING,
};

const FORTNIGHT = "Fortnight starts on";
const HOLIDAYS = "Public holidays";
const EVENING = "Evening loading (Mon-Fri 7pm-midnight)";
const NIGHT = "Night loading (Mon-Fri midnight-7am)";
const rateLabel = (level: AwardLevel) => `Award rate ${AWARD_LEVEL_NAMES[level]}`;
const MATCHING_LABELS: Record<keyof MatchingSettings, string> = {
  preferExperienced: "Matching: prefer experienced staff",
  usePreferences: "Matching: follow shift preferences",
  keepTogether: "Matching: keep staff on the same event",
};
const MATCHING_KEYS = Object.keys(MATCHING_LABELS) as (keyof MatchingSettings)[];

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
    matching: Object.fromEntries(
      MATCHING_KEYS.map((key) => {
        const value = get(MATCHING_LABELS[key]);
        return [key, value === undefined || value === "" ? DEFAULT_MATCHING[key] : /^(yes|y|true|1|on)$/i.test(value)];
      })
    ) as unknown as MatchingSettings,
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
    ...MATCHING_KEYS.map((key) => [MATCHING_LABELS[key], settings.matching[key] ? "Yes" : "No"]),
  ];
}

function money(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_RATE ? Math.round(amount * 100) / 100 : null;
}

export function parseMatchingInput(body: unknown): MatchingSettings | string {
  if (typeof body !== "object" || body === null) return "Invalid matching settings";
  const input = body as Record<string, unknown>;
  if (!MATCHING_KEYS.every((key) => typeof input[key] === "boolean")) return "Invalid matching settings";
  return Object.fromEntries(MATCHING_KEYS.map((key) => [key, input[key]])) as unknown as MatchingSettings;
}

// Validates pay settings sent from Settings. Returns an error message or the
// settings (matching settings are kept from `current`).
export function parseSettingsInput(body: unknown, current: PaySettings = DEFAULT_SETTINGS): PaySettings | string {
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
    matching: current.matching,
  };
}
