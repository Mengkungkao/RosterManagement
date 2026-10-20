import { describe, expect, it } from "vitest";
import {
  autoFill,
  checkAvailability,
  entryWindow,
  formatWindow,
  listShifts,
  minCoverage,
  rankCandidates,
  rosterIssues,
  shiftWindow,
  summarizeHours,
  workDay,
} from "@/lib/roster";
import { ANCHOR, FORTNIGHT, OFF, event, hours, person, week } from "./helpers";

// Shifts already worked: one event per day from 2026-10-12, `each` hours long
// (worked hours are 30 minutes less for anything over 6h — the unpaid break).
function pastShifts(name: string, count: number, each: number) {
  return Array.from({ length: count }, (_, i) =>
    event({
      date: `2026-10-${String(12 + i).padStart(2, "0")}`,
      startTime: "06:00",
      endTime: `${String(6 + each).padStart(2, "0")}:00`,
      setupHours: 0,
      packDownHours: 0,
      staff: [{ name, startTime: "", endTime: "" }],
    })
  );
}

describe("shift times", () => {
  it("adds setup before and pack-down after the event", () => {
    expect(formatWindow(shiftWindow(event({ startTime: "17:00", endTime: "22:00" })))).toBe("16:00–23:00");
  });

  it("handles events that end after midnight", () => {
    const window = shiftWindow(event({ startTime: "22:00", endTime: "02:00", packDownHours: 0.5 }));
    expect(window).toEqual({ start: 21 * 60, end: 26.5 * 60 });
  });

  it("uses a person's own times when they have them, past midnight included", () => {
    const e = event({ startTime: "20:00", endTime: "23:00" });
    expect(entryWindow(e, { name: "A", startTime: "18:00", endTime: "23:00" })).toEqual({ start: 1080, end: 1380 });
    expect(entryWindow(e, { name: "A", startTime: "20:00", endTime: "01:00" })).toEqual({ start: 1200, end: 1500 });
  });
});

describe("availability", () => {
  const shift = { start: 16 * 60, end: 23 * 60 };

  it("is full, partial or none", () => {
    expect(checkAvailability(week(), "2026-10-20", shift).coverage).toBe("full");
    expect(checkAvailability(week({}, OFF), "2026-10-20", shift).coverage).toBe("none");
    const partial = checkAvailability(week({ Tuesday: hours("18:00", "23:00") }), "2026-10-20", shift);
    expect(partial.coverage).toBe("partial");
    expect(partial.free).toEqual({ start: 18 * 60, end: 23 * 60 });
  });

  it("joins all-day availability across midnight", () => {
    const late = { start: 22 * 60, end: 26 * 60 }; // Tue 22:00 → Wed 02:00
    expect(checkAvailability(week({}, OFF), "2026-10-20", late).coverage).toBe("none");
    const both = week({ Tuesday: { status: "available_all_day", startTime: "", endTime: "" }, Wednesday: { status: "available_all_day", startTime: "", endTime: "" } }, OFF);
    expect(checkAvailability(both, "2026-10-20", late).coverage).toBe("full");
  });

  it("counts overnight availability from the day before", () => {
    // Free Monday 22:00 → Tuesday 06:00; the shift is Tuesday 01:00–03:00.
    const nightOwl = week({ Monday: hours("22:00", "06:00") }, OFF);
    expect(checkAvailability(nightOwl, "2026-10-20", { start: 60, end: 180 }).coverage).toBe("full");
  });
});

describe("auto-fill", () => {
  it("never takes a student past 48 hours a fortnight", () => {
    // Sam has fewer hours than Cas, so would be picked if not for the limit.
    const worked = [...pastShifts("Sam", 4, 11), ...pastShifts("Cas", 5, 9)]; // 42h and 42.5h worked
    const e = event({ date: "2026-10-22" }); // 16:00–23:00, 6.5h worked → Sam would reach 48.5h
    const result = autoFill([...worked, e], [person("Sam", "student"), person("Cas")], FORTNIGHT, ANCHOR);
    expect(result.events.find((x) => x.id === e.id)!.staff.map((s) => s.name)).toEqual(["Cas"]);
  });

  it("leaves the place open rather than break the student limit", () => {
    const worked = pastShifts("Sam", 4, 11); // 42h
    const e = event({ date: "2026-10-22" }); // +6.5h
    const result = autoFill([...worked, e], [person("Sam", "student")], FORTNIGHT, ANCHOR);
    expect(result.shortfalls).toEqual([{ eventId: e.id, eventName: "Event", date: "2026-10-22", missing: 1 }]);
  });

  it("gives full-timers shifts first while they are under 76 hours", () => {
    const e = event();
    const result = autoFill([e], [person("Cas"), person("Ful", "full_time")], FORTNIGHT, ANCHOR);
    expect(result.events[0].staff.map((s) => s.name)).toEqual(["Ful"]);
  });

  it("avoids taking a full-timer past 76 hours when someone else can work", () => {
    const worked = pastShifts("Ful", 7, 11); // 73.5h
    const e = event({ date: "2026-10-24" }); // +6.5h = 80h
    const staff = [person("Ful", "full_time"), person("Cas")];
    expect(autoFill([...worked, e], staff, FORTNIGHT, ANCHOR).events.at(-1)!.staff[0].name).toBe("Cas");
    // ...but still rosters them when no one else is free.
    expect(autoFill([...worked, e], [staff[0]], FORTNIGHT, ANCHOR).events.at(-1)!.staff[0].name).toBe("Ful");
  });

  it("tries to keep casuals within 76 hours too", () => {
    // Cas isn't working at that time but would reach 80h; Cat is on another
    // function then (which shares staff) and adds no hours by covering this one.
    const worked = pastShifts("Cas", 7, 11); // 73.5h
    const greatRoom = event({ date: "2026-10-24", name: "AAA", staff: [{ name: "Cat", startTime: "", endTime: "" }] });
    const studio = event({ date: "2026-10-24", name: "BBB", shareStaff: true });
    const staff = [person("Cas"), person("Cat")];
    expect(autoFill([...worked, greatRoom, studio], staff, FORTNIGHT, ANCHOR).events.at(-1)!.staff[0].name).toBe("Cat");
    // ...but still rosters them when no one else can work.
    expect(autoFill([...worked, studio], [staff[0]], FORTNIGHT, ANCHOR).events.at(-1)!.staff[0].name).toBe("Cas");
  });

  it("never rosters anyone past 12 hours in a day", () => {
    // Ann has fewer hours this fortnight, so would be picked if not for the limit.
    const morning = event({ date: "2026-10-21", startTime: "06:00", endTime: "12:00", setupHours: 0, packDownHours: 0, staff: [{ name: "Ann", startTime: "", endTime: "" }] });
    const earlier = pastShifts("Ben", 3, 10); // 28.5h on other days
    const evening = event({ date: "2026-10-21", startTime: "13:00", endTime: "20:00", setupHours: 0, packDownHours: 0 }); // 6.5h more
    const result = autoFill([morning, ...earlier, evening], [person("Ann"), person("Ben")], FORTNIGHT, ANCHOR);
    expect(result.events.at(-1)!.staff[0].name).toBe("Ben");
  });

  it("splits a function longer than one person may work into early and late shifts", () => {
    const gr = event({ name: "AAA", startTime: "08:00", endTime: "20:00", staffNeeded: 2 }); // shift 07:00–21:00
    const staff = ["Ann", "Ben", "Cat", "Dan"].map((n) => person(n));
    const [filled] = autoFill([gr], staff, FORTNIGHT, ANCHOR).events;
    expect(filled.staff).toEqual([
      { name: "Ann", startTime: "07:00", endTime: "14:00" },
      { name: "Ben", startTime: "07:00", endTime: "14:00" },
      { name: "Cat", startTime: "14:00", endTime: "21:00" },
      { name: "Dan", startTime: "14:00", endTime: "21:00" },
    ]);
    expect(minCoverage(filled)).toBe(2);
  });

  it("puts part-timers under 8 hours that week ahead of everyone", () => {
    const e = event();
    const staff = [person("Ful", "full_time"), person("Cas"), person("Pat", "part_time")];
    expect(autoFill([e], staff, FORTNIGHT, ANCHOR).events[0].staff[0].name).toBe("Pat");
  });

  it("does not double-book anyone on events at the same time", () => {
    const a = event({ name: "A" });
    const b = event({ name: "B", startTime: "18:00", endTime: "20:00" });
    const result = autoFill([a, b], [person("Cas")], FORTNIGHT, ANCHOR);
    expect(result.added).toBe(1);
    expect(result.shortfalls.map((s) => s.eventName)).toEqual(["B"]);
  });

  it("lets a function that shares staff use people from another one, counting their time once", () => {
    const greatRoom = event({ name: "AAA" });
    const studio = event({ name: "BBB", startTime: "18:00", endTime: "20:00", shareStaff: true });
    const result = autoFill([greatRoom, studio], [person("Cas")], FORTNIGHT, ANCHOR);
    expect(result.events.map((e) => e.staff.map((s) => s.name))).toEqual([["Cas"], ["Cas"]]);
    const [row] = summarizeHours([person("Cas")], listShifts(result.events), FORTNIGHT);
    expect(row.total).toBe(6.5); // 16:00–23:00 once, less the break
  });

  it("prefers people who aren't working yet over sharing", () => {
    const greatRoom = event({ name: "AAA", staff: [{ name: "Cas", startTime: "", endTime: "" }] });
    const studio = event({ name: "BBB", startTime: "18:00", endTime: "20:00", shareStaff: true });
    const staff = [person("Cas"), person("New")];
    expect(autoFill([greatRoom, studio], staff, FORTNIGHT, ANCHOR).events[1].staff[0].name).toBe("New");
  });

  it("only picks people free for the whole shift", () => {
    const e = event();
    const result = autoFill([e], [person("Late", "casual", week({ Tuesday: hours("18:00", "23:00") }))], FORTNIGHT, ANCHOR);
    expect(result.added).toBe(0);
  });

  it("keeps who is already rostered and shares the rest out evenly", () => {
    const first = event({ staffNeeded: 2, staff: [{ name: "Ann", startTime: "", endTime: "" }] });
    const second = event({ date: "2026-10-21" });
    const third = event({ date: "2026-10-23" });
    const result = autoFill([first, second, third], [person("Ann"), person("Ben"), person("Cat")], FORTNIGHT, ANCHOR);
    expect(result.events[0].staff.map((s) => s.name)).toEqual(["Ann", "Ben"]);
    expect(result.events[1].staff[0].name).toBe("Cat");
    // Everyone now has 7h, so the staff list's own order decides.
    expect(result.events[2].staff[0].name).toBe("Ann");
  });

  it("leaves events before today as they are", () => {
    const past = event({ date: "2026-10-13" });
    const upcoming = event({ date: "2026-10-22" });
    const result = autoFill([past, upcoming], [person("Cas")], FORTNIGHT, ANCHOR, "2026-10-19");
    expect(result.events.map((e) => e.staff.length)).toEqual([0, 1]);
    expect(result.shortfalls).toEqual([]);
  });

  it("only fills events in the chosen fortnight", () => {
    const outside = event({ date: "2026-10-26" });
    expect(autoFill([outside], [person("Cas")], FORTNIGHT, ANCHOR).added).toBe(0);
  });
});

describe("candidates for adding by hand", () => {
  it("lists blocked people last with the reason", () => {
    const busy = event({ name: "Gala", staff: [{ name: "Ann", startTime: "", endTime: "" }] });
    const e = event({ name: "Dinner" });
    const shifts = listShifts([busy, e]);
    const list = rankCandidates(e, [person("Ann"), person("Ben")], shifts, ANCHOR);
    expect(list.map((c) => c.staffName)).toEqual(["Ben", "Ann"]);
    expect(list[1].blockers).toEqual(["Already on Gala 16:00–23:00"]);
  });
});

describe("hours summary", () => {
  it("splits the fortnight into weeks and flags the rules", () => {
    const shifts = listShifts([
      ...pastShifts("Sam", 5, 11), // 52.5h worked, all in week 1
      event({ date: "2026-10-13", staff: [{ name: "Pat", startTime: "", endTime: "" }] }), // 6.5h in week 1
    ]);
    const summary = summarizeHours(
      [person("Sam", "student"), person("Pat", "part_time"), person("Ful", "full_time")],
      shifts,
      FORTNIGHT
    );
    expect(summary[0]).toMatchObject({ week1: 52.5, week2: 0, total: 52.5, warnings: ["Over the 48h student limit"] });
    expect(summary[1].warnings).toEqual(["Week 1 under 8h", "Week 2 under 8h"]);
    expect(summary[2].warnings).toEqual([]);
  });

  it("keeps hours of people no longer on the staff list", () => {
    const shifts = listShifts([event({ staff: [{ name: "Gone", startTime: "", endTime: "" }] })]);
    const [row] = summarizeHours([], shifts, FORTNIGHT);
    expect(row).toMatchObject({ staffName: "Gone", total: 6.5, warnings: ["Not on the staff list"] });
  });

  it("flags a day over 12 hours", () => {
    const long = event({ startTime: "08:00", endTime: "20:00", staff: [{ name: "Ann", startTime: "", endTime: "" }] }); // 07:00–21:00
    const [row] = summarizeHours([person("Ann")], listShifts([long]), FORTNIGHT);
    expect(row.warnings).toEqual(["13h on Tue 20 Oct (max 12h)"]); // 14h less two breaks
  });
});

describe("roster issues", () => {
  it("flags people rostered when they are not free", () => {
    const e = event({ staff: [{ name: "Ann", startTime: "", endTime: "" }] });
    const issues = rosterIssues(e, [person("Ann", "casual", week({}, OFF))], listShifts([e]));
    expect(issues).toEqual(["Ann isn't available for all of 16:00–23:00"]);
  });

  it("shows when part of the shift is short of people", () => {
    const e = event({
      staffNeeded: 1,
      staff: [{ name: "Ann", startTime: "16:00", endTime: "22:00" }],
    });
    expect(minCoverage(e)).toBe(0);
    expect(rosterIssues(e, [person("Ann")], listShifts([e]))).toEqual(["Fewer than 1 on at 22:00–23:00"]);
  });
});

describe("breaks across functions at the same time", () => {
  it("gives someone on two shared functions one break, not one per function", () => {
    const greatRoom = event({ name: "AAA", startTime: "07:00", endTime: "14:00", setupHours: 0, packDownHours: 0, staff: [{ name: "Ava", startTime: "", endTime: "" }] });
    const studio = event({ name: "BBB", startTime: "11:00", endTime: "18:00", setupHours: 0, packDownHours: 0, shareStaff: true, staff: [{ name: "Ava", startTime: "", endTime: "" }] });
    const shifts = listShifts([greatRoom, studio]);
    expect(shifts.map((s) => s.breaks.map(formatWindow))).toEqual([["12:15–12:45"], ["12:15–12:45"]]);
    const day = workDay(shifts, "Ava", "2026-10-20");
    expect(day.hours).toBe(10.5);
    expect(day.stretches.map(formatWindow)).toEqual(["07:00–18:00"]);
  });
});
