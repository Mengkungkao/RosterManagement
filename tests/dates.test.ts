import { describe, expect, it } from "vitest";
import {
  addDays,
  formatHours,
  fortnightStartFor,
  isValidDate,
  normalizeDate,
  weekdayOf,
} from "@/lib/dates";

describe("dates", () => {
  it("knows the weekday of a date", () => {
    expect(weekdayOf("2026-10-19")).toBe("Monday");
    expect(weekdayOf("2026-10-25")).toBe("Sunday");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("does not shift around daylight saving changes (Melbourne: 5 Apr and 4 Oct 2026)", () => {
    expect(addDays("2026-04-04", 1)).toBe("2026-04-05");
    expect(addDays("2026-10-03", 2)).toBe("2026-10-05");
  });

  it("finds the pay fortnight a date belongs to, before or after the anchor", () => {
    expect(fortnightStartFor("2026-10-19", "2026-01-05")).toBe("2026-10-12");
    expect(fortnightStartFor("2026-10-25", "2026-01-05")).toBe("2026-10-12");
    expect(fortnightStartFor("2026-10-26", "2026-01-05")).toBe("2026-10-26");
    expect(fortnightStartFor("2026-01-01", "2026-01-05")).toBe("2025-12-22");
  });

  it("reads dates typed into the sheet in Australian order", () => {
    expect(normalizeDate("5/1/2026")).toBe("2026-01-05");
    expect(normalizeDate("2026-07-24")).toBe("2026-07-24");
    expect(normalizeDate("31/2/2026")).toBe("");
    expect(isValidDate("2026-02-30")).toBe(false);
  });

  it("formats hours without trailing zeros", () => {
    expect(formatHours(7)).toBe("7h");
    expect(formatHours(7.5)).toBe("7.5h");
    expect(formatHours(7.25)).toBe("7.25h");
  });
});
