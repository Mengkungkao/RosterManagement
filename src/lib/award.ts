// Hospitality Industry (General) Award 2020 [MA000009] — the pieces this app
// needs to work out minimum pay the way the Fair Work pay calculator does.
//
// Sources (checked 19 Oct 2026):
// - Fair Work Ombudsman pay guide, effective first full pay period on or after
//   1 July 2026, published 24 June 2026 (base rates and loadings below);
// - the award text, clauses 11 (casuals), 15 (ordinary hours), 16 (breaks),
//   28 (overtime, Table 13) and 29 (penalty rates, Table 14).
// Base rates change every 1 July: update them on the Wages page (they're
// stored in the Settings tab), not here.

export const AWARD_NAME = "Hospitality Industry (General) Award 2020 [MA000009]";
export const PAY_GUIDE_URL = "https://www.fairwork.gov.au/pay-and-wages/minimum-wages/pay-guides";
export const PAY_CALCULATOR_URL = "https://calculate.fairwork.gov.au/";
export const DEFAULT_RATES_FROM = "2026-07-01";

export const AWARD_LEVELS = [
  "introductory",
  "level1",
  "level2",
  "level3",
  "level4",
  "level5",
  "level6",
] as const;
export type AwardLevel = (typeof AWARD_LEVELS)[number];

export const AWARD_LEVEL_NAMES: Record<AwardLevel, string> = {
  introductory: "Introductory",
  level1: "Level 1",
  level2: "Level 2",
  level3: "Level 3",
  level4: "Level 4",
  level5: "Level 5",
  level6: "Level 6",
};

// Example jobs at each level, from the pay guide.
export const AWARD_LEVEL_EXAMPLES: Record<AwardLevel, string> = {
  introductory: "new to hospitality, up to 3 months",
  level1: "food & beverage attendant grade 1, kitchen attendant grade 1",
  level2: "food & beverage attendant grade 2, cook grade 1, door person grade 1",
  level3: "food & beverage attendant grade 3, cook grade 2",
  level4: "food & beverage attendant (tradesperson) grade 4, cook (tradesperson) grade 3",
  level5: "food & beverage supervisor, cook (tradesperson) grade 4",
  level6: "cook (tradesperson) grade 5",
};

// Full-time/part-time minimum hourly rates, pay guide from 1 July 2026.
export const DEFAULT_AWARD_RATES: Record<AwardLevel, number> = {
  introductory: 25.74,
  level1: 26.44,
  level2: 27.08,
  level3: 27.97,
  level4: 29.45,
  level5: 31.3,
  level6: 32.13,
};

// Table 14: added "per hour or part of an hour", Monday to Friday only.
export const DEFAULT_EVENING_LOADING = 2.95; // 7pm to midnight
export const DEFAULT_NIGHT_LOADING = 4.42; // midnight to 7am

// Table 14 — % of the full-time/part-time ordinary hourly rate. The casual
// percentages already include the 25% casual loading (cl. 11.1).
export const PENALTY_PERCENT = {
  weekday: { permanent: 100, casual: 125 },
  saturday: { permanent: 125, casual: 150 },
  sunday: { permanent: 150, casual: 175 },
  publicHoliday: { permanent: 225, casual: 250 },
} as const;

// Table 13 — overtime, % of the ordinary hourly rate (the same for casuals).
export const OVERTIME_PERCENT = { weekdayFirst2h: 150, weekdayAfter2h: 200, weekend: 200 } as const;

// When overtime starts: more than 11.5 ordinary hours a day for full- and
// part-time (cl. 15.1(c), 15.2(b)), more than 12 hours a day for casuals
// (cl. 11.2), and more than 76 hours in the fortnight roster cycle for
// everyone (38 a week averaged, cl. 10.13, 11.2, 15.1(b)(v)).
export const DAILY_ORDINARY_MINUTES = { permanent: 11.5 * 60, casual: 12 * 60 } as const;
export const FORTNIGHT_ORDINARY_MINUTES = 76 * 60;

// Minimum paid hours: casuals 2h each time they come in (cl. 11.3); on a
// public holiday 4h for full/part-time and 2h for casuals (cl. 29.4).
export const CASUAL_MIN_ENGAGEMENT_MINUTES = 2 * 60;
export const PUBLIC_HOLIDAY_MIN_MINUTES = { permanent: 4 * 60, casual: 2 * 60 } as const;

// `percent` of an hourly rate, rounded to the cent (half up) the way the pay
// guide's rates are. Done in whole cents: 25.74 × 125% must be 32.18, not 32.17.
export function percentOf(rate: number, percent: number): number {
  return Math.round((Math.round(rate * 100) * percent) / 100) / 100;
}

export function isAwardLevel(value: unknown): value is AwardLevel {
  return typeof value === "string" && (AWARD_LEVELS as readonly string[]).includes(value);
}

// Reads the sheet's Award Level cell: "Level 2", "level2", "L2", "2", "Introductory".
export function parseAwardLevel(cell: string): AwardLevel | null {
  const value = cell.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value.startsWith("intro")) return "introductory";
  const match = value.match(/^(?:level|l)?([1-6])$/);
  return match ? (`level${match[1]}` as AwardLevel) : null;
}
