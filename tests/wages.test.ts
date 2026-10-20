import { describe, expect, it } from "vitest";
import { AWARD_LEVELS, DEFAULT_AWARD_RATES, OVERTIME_PERCENT, PENALTY_PERCENT, percentOf } from "@/lib/award";
import type { EmploymentType } from "@/lib/employment";
import type { RosterEntry } from "@/lib/events";
import { listShifts } from "@/lib/roster";
import { DEFAULT_SETTINGS, type PaySettings, parseSettingsRows, settingsToRows } from "@/lib/settings";
import { calculateWages } from "@/lib/wages";
import { FORTNIGHT, event } from "./helpers";

const settings: PaySettings = { ...DEFAULT_SETTINGS, publicHolidays: ["2026-10-19"] }; // a Monday
const on = (name: string): RosterEntry[] => [{ name, startTime: "", endTime: "" }];

// One person's pay for shifts given as [date, start, end] (no setup/pack-down).
function pay(
  employmentType: EmploymentType,
  shifts: [string, string, string][],
  level: keyof typeof DEFAULT_AWARD_RATES = "level1",
  withSettings: PaySettings = settings
) {
  const events = shifts.map(([date, startTime, endTime]) =>
    event({ date, startTime, endTime, setupHours: 0, packDownHours: 0, staff: on("Ann") })
  );
  const summary = calculateWages(
    [{ staffName: "Ann", employmentType, awardLevel: level }],
    listShifts(events),
    withSettings,
    FORTNIGHT
  );
  return summary.lines[0];
}

describe("award rates match the Fair Work pay guide from 1 July 2026", () => {
  // [Saturday, Sunday, public holiday, overtime first 2h, overtime after 2h] for full/part-time,
  // then [hourly, Saturday, Sunday, public holiday] for casuals — copied from the pay guide.
  const guide: Record<string, [number[], number[]]> = {
    introductory: [[32.18, 38.61, 57.92, 38.61, 51.48], [32.18, 38.61, 45.05, 64.35]],
    level1: [[33.05, 39.66, 59.49, 39.66, 52.88], [33.05, 39.66, 46.27, 66.1]],
    level2: [[33.85, 40.62, 60.93, 40.62, 54.16], [33.85, 40.62, 47.39, 67.7]],
    level3: [[34.96, 41.96, 62.93, 41.96, 55.94], [34.96, 41.96, 48.95, 69.93]],
    level4: [[36.81, 44.18, 66.26, 44.18, 58.9], [36.81, 44.18, 51.54, 73.63]],
    level5: [[39.13, 46.95, 70.43, 46.95, 62.6], [39.13, 46.95, 54.78, 78.25]],
    level6: [[40.16, 48.2, 72.29, 48.2, 64.26], [40.16, 48.2, 56.23, 80.33]],
  };

  it.each(AWARD_LEVELS)("%s", (level) => {
    const base = DEFAULT_AWARD_RATES[level];
    const p = PENALTY_PERCENT;
    expect([
      percentOf(base, p.saturday.permanent),
      percentOf(base, p.sunday.permanent),
      percentOf(base, p.publicHoliday.permanent),
      percentOf(base, OVERTIME_PERCENT.weekdayFirst2h),
      percentOf(base, OVERTIME_PERCENT.weekdayAfter2h),
    ]).toEqual(guide[level][0]);
    expect([
      percentOf(base, p.weekday.casual),
      percentOf(base, p.saturday.casual),
      percentOf(base, p.sunday.casual),
      percentOf(base, p.publicHoliday.casual),
    ]).toEqual(guide[level][1]);
  });
});

describe("award pay", () => {
  it("pays casuals 25% more on weekdays", () => {
    expect(pay("casual", [["2026-10-13", "09:00", "15:00"]]).pay).toBe(198.3); // 6 × $33.05
    expect(pay("full_time", [["2026-10-13", "09:00", "15:00"]]).pay).toBe(158.64); // 6 × $26.44
  });

  it("pays students as casuals", () => {
    expect(pay("student", [["2026-10-13", "09:00", "15:00"]]).pay).toBe(198.3);
  });

  it("pays Saturday, Sunday and public holiday rates", () => {
    expect(pay("casual", [["2026-10-17", "10:00", "14:00"]]).pay).toBe(158.64); // 4 × $39.66
    expect(pay("casual", [["2026-10-18", "10:00", "14:00"]]).pay).toBe(185.08); // 4 × $46.27
    expect(pay("full_time", [["2026-10-19", "10:00", "14:00"]]).pay).toBe(237.96); // 4 × $59.49
  });

  it("takes out the unpaid break", () => {
    const line = pay("full_time", [["2026-10-13", "10:00", "17:00"]]); // 7h shift
    expect(line.workedHours).toBe(6.5);
    expect(line.pay).toBe(171.86); // 6.5 × $26.44
    expect(line.days[0]).toMatchObject({ times: "10:00–17:00", breaks: ["14:00–14:30"], hours: 6.5 });
  });

  it("adds the evening loading per hour or part of an hour", () => {
    // Level 2 full-time, Wednesday 17:00–19:30: 2.5h × $27.08 + 1 × $2.95 (19:00–19:30 is part of an hour)
    expect(pay("full_time", [["2026-10-14", "17:00", "19:30"]], "level2").pay).toBe(70.65);
  });

  it("adds the night loading after midnight on a weekday, but not on Saturday", () => {
    // Thu 22:00 → Fri 02:00: 4 × $26.44 + 2 × $2.95 + 2 × $4.42
    expect(pay("full_time", [["2026-10-15", "22:00", "02:00"]]).pay).toBe(120.5);
    // Fri 22:00 → Sat 02:00: 2 × $26.44 + 2 × $2.95 + 2 × $33.05 (Saturday rate, no loading)
    expect(pay("full_time", [["2026-10-16", "22:00", "02:00"]]).pay).toBe(124.88);
  });

  it("pays overtime after 11.5 ordinary hours in a day for full-time", () => {
    // 07:00–19:30 is 12h of work after the break: 11.5h ordinary + 0.5h at 150%.
    const line = pay("full_time", [["2026-10-13", "07:00", "19:30"]]);
    expect(line.items.map((i) => [i.label, i.hours])).toEqual([
      ["Mon–Fri 100%", 11.5],
      ["Overtime first 2h 150%", 0.5],
    ]);
    expect(line.pay).toBe(323.89); // 11.5 × $26.44 + 0.5 × $39.66
  });

  it("pays overtime past 76 hours in the fortnight, first 2h of a day at 150% then 200%", () => {
    const tenDays = ["12", "13", "14", "15", "16", "19", "20", "21", "22", "23"].map(
      (d): [string, string, string] => [`2026-10-${d}`, "08:00", "16:30"] // 8h of work each
    );
    const line = pay("full_time", tenDays, "level1", DEFAULT_SETTINGS);
    expect(line.workedHours).toBe(80);
    expect(line.items.map((i) => [i.label, i.hours])).toEqual([
      ["Mon–Fri 100%", 76],
      ["Overtime first 2h 150%", 2],
      ["Overtime after 2h 200%", 2],
    ]);
    expect(line.pay).toBe(2194.52); // 76 × $26.44 + 2 × $39.66 + 2 × $52.88
  });

  it("pays at least 2 hours for a casual and 4 hours on a public holiday for full-time", () => {
    expect(pay("casual", [["2026-10-13", "10:00", "11:00"]]).pay).toBe(66.1); // 2 × $33.05
    expect(pay("full_time", [["2026-10-19", "10:00", "12:00"]]).pay).toBe(237.96); // 4 × $59.49
  });

  it("rounds half cents up, like the pay guide", () => {
    // Level 2 full-time, Fri 23:30 → Sat 00:30: 0.5h × $27.08 + 1 × $2.95 + 0.5h × $33.85 ($16.925 → $16.93)
    expect(pay("full_time", [["2026-10-16", "23:30", "00:30"]], "level2").pay).toBe(33.42);
  });

  it("counts time on functions running at once only once", () => {
    const events = [
      event({ date: "2026-10-13", startTime: "09:00", endTime: "13:00", setupHours: 0, packDownHours: 0, staff: on("Ann") }),
      event({ date: "2026-10-13", startTime: "11:00", endTime: "15:00", setupHours: 0, packDownHours: 0, shareStaff: true, staff: on("Ann") }),
    ];
    const { lines } = calculateWages(
      [{ staffName: "Ann", employmentType: "full_time", awardLevel: "level1" }],
      listShifts(events),
      settings,
      FORTNIGHT
    );
    expect(lines[0].workedHours).toBe(6);
    expect(lines[0].pay).toBe(158.64);
  });

  it("lists rostered staff without an award level instead of guessing", () => {
    const shifts = listShifts([event({ staff: on("Cat") })]);
    const summary = calculateWages([{ staffName: "Cat", employmentType: "casual", awardLevel: null }], shifts, settings, FORTNIGHT);
    expect(summary.lines[0].pay).toBeNull();
    expect(summary.missingLevels).toEqual(["Cat"]);
  });

  it("only counts the chosen fortnight", () => {
    expect(pay("casual", [["2026-10-26", "09:00", "15:00"]]).workedHours).toBe(0);
  });
});

describe("pay settings", () => {
  it("round-trips through the Settings tab", () => {
    const custom: PaySettings = { ...settings, awardRates: { ...DEFAULT_AWARD_RATES, level2: 28.1 }, eveningLoading: 3.05 };
    expect(parseSettingsRows(settingsToRows(custom).slice(1))).toEqual(custom);
  });

  it("falls back to defaults for missing or broken values, and ignores old multiplier rows", () => {
    expect(parseSettingsRows([["Award rate Level 1", "abc"], ["Saturday pay multiplier", "1.25"]])).toEqual(DEFAULT_SETTINGS);
  });
});
