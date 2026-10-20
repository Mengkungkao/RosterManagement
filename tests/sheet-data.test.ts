import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyWeek } from "@/lib/availability";
import {
  deleteEvent,
  listEvents,
  parseRosterCell,
  formatRosterCell,
  setEventStaff,
  updateEvent,
} from "@/lib/events";
import {
  addStaff,
  claimOrVerifyStaffPassword,
  readAllStaff,
  saveStaffAvailability,
  updateStaff,
  verifyStaffPassword,
} from "@/lib/staff";
import { MemoryStore, setStoreForTesting } from "@/lib/store";

// Rows exactly as the app wrote them before this version (12 / 9 columns).
const OLD_STAFF = [
  ["No", "Name", "Status", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Last Updated", "Password"],
  ["1", "Ann", "Partially available", "All day", "17:00-23:00", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "2026-07-24 10:00:00", "ann-pw"],
  ["2", "Ben", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "Unavailable", "2026-07-24 11:00:00", ""],
];
const OLD_EVENTS = [
  ["No", "Event Name", "Date", "Start Time", "End Time", "Location", "actions", "Notes", "ID"],
  ["1", "Gala", "2026-07-24", "18:00", "23:00", "Hall", "18:30 Entree serve\nSpeeches", "Black tie", "id-gala"],
  ["2", "Broken row", "next friday", "18:00", "23:00", "", "", "", "id-broken"],
  ["3", "Brunch", "25/7/2026", "09:00", "12:00", "", "", "", ""],
];

let store: MemoryStore;

beforeEach(async () => {
  store = new MemoryStore();
  setStoreForTesting(store);
  await store.writeAll("Availability", OLD_STAFF);
  await store.writeAll("Events", OLD_EVENTS);
});

afterEach(() => setStoreForTesting(null));

describe("staff tab", () => {
  it("reads rows written by the old version, with safe defaults for the new columns", async () => {
    const staff = await readAllStaff();
    expect(staff.map((s) => [s.staffName, s.employmentType, s.awardLevel, s.hasPassword])).toEqual([
      ["Ann", "casual", null, true],
      ["Ben", "casual", null, false],
    ]);
    expect(staff[0].week.Tuesday).toEqual({ status: "custom", startTime: "17:00", endTime: "23:00" });
  });

  it("updates only the saving person's row and keeps everyone else's", async () => {
    const result = await saveStaffAvailability("ben", emptyWeek(), "ben-pw");
    expect(result.ok).toBe(true);
    const rows = await store.read("Availability");
    expect(rows[0].slice(-3)).toEqual(["Type", "Hourly Rate", "Award Level"]);
    expect(rows[1]).toEqual(OLD_STAFF[1]); // Ann untouched, password included
    expect(rows[2][11]).toBe("ben-pw");
  });

  it("refuses the wrong password", async () => {
    expect(await saveStaffAvailability("Ann", emptyWeek(), "nope")).toEqual({ ok: false, error: "Incorrect password" });
    expect((await verifyStaffPassword("Ann", "ann-pw")).ok).toBe(true);
    expect((await claimOrVerifyStaffPassword("Ann", "nope")).ok).toBe(false);
  });

  it("adds new staff at the bottom and stores type and award level", async () => {
    expect((await addStaff("Cat", "student", "level2")).ok).toBe(true);
    expect((await addStaff("cat", "casual", null)).ok).toBe(false);
    await updateStaff("Ann", { employmentType: "full_time", awardLevel: "introductory", resetPassword: true });
    const staff = await readAllStaff();
    expect(staff.map((s) => [s.staffName, s.employmentType, s.awardLevel, s.hasPassword])).toEqual([
      ["Ann", "full_time", "introductory", false],
      ["Ben", "casual", null, false],
      ["Cat", "student", "level2", false],
    ]);
    const rows = await store.read("Availability");
    expect(rows[1].slice(-3)).toEqual(["Full-time", "", "Introductory"]);
  });

  it("keeps an hourly rate typed in by the previous version", async () => {
    await store.writeRow("Availability", 1, [...OLD_STAFF[0], "Type", "Hourly Rate"]);
    await store.writeRow("Availability", 2, [...OLD_STAFF[1], "Casual", "31.5"]);
    await updateStaff("Ann", { awardLevel: "level3" });
    expect((await store.read("Availability"))[1].slice(-3)).toEqual(["Casual", "31.5", "Level 3"]);
  });
});

describe("events tab", () => {
  it("reads old rows with default staffing and fixes up dates and IDs", async () => {
    const events = await listEvents();
    expect(
      events.map((e) => [e.name, e.date, e.staffNeeded, e.setupHours, e.packDownHours, e.shareStaff, e.staff])
    ).toEqual([
      ["Gala", "2026-07-24", 1, 1, 1, false, []],
      ["Brunch", "2026-07-25", 1, 1, 1, false, []],
    ]);
    expect(events[0].actions).toEqual([
      { label: "Entree serve", time: "18:30" },
      { label: "Speeches", time: "" },
    ]);
    expect(events[1].id).toBe("row-4"); // stable between reads, so it can still be edited
    expect((await listEvents())[1].id).toBe("row-4");
  });

  it("saves who is rostered without losing the row it cannot read", async () => {
    await setEventStaff("id-gala", [
      { name: "Ann", startTime: "", endTime: "" },
      { name: "Ben", startTime: "19:00", endTime: "23:00" },
    ]);
    const rows = await store.read("Events");
    const gala = rows.find((r) => r[8] === "id-gala")!;
    expect(gala[12]).toBe("Ann\nBen 19:00-23:00");
    expect(rows.some((r) => r[1] === "Broken row" && r[2] === "next friday")).toBe(true);
    expect((await listEvents())[0].staff[1]).toEqual({ name: "Ben", startTime: "19:00", endTime: "23:00" });
  });

  it("keeps the roster when the event details are edited", async () => {
    await setEventStaff("id-gala", [{ name: "Ann", startTime: "", endTime: "" }]);
    const [gala] = await listEvents();
    const { id: _id, staff: _staff, ...details } = gala;
    await updateEvent("id-gala", { ...details, staffNeeded: 3, shareStaff: true });
    const [updated] = await listEvents();
    expect(updated.staffNeeded).toBe(3);
    expect(updated.shareStaff).toBe(true);
    expect((await store.read("Events")).find((r) => r[8] === "id-gala")![13]).toBe("Yes");
    expect(updated.staff.map((s) => s.name)).toEqual(["Ann"]);
  });

  it("blanks the leftover row when an event is deleted", async () => {
    await deleteEvent("id-gala");
    const rows = await store.read("Events");
    expect(rows.map((r) => r[1])).toEqual(["Event Name", "Brunch", "Broken row"]);
  });

  it("round-trips the rostered staff cell", () => {
    const staff = [
      { name: "Ann", startTime: "", endTime: "" },
      { name: "Mary Jane", startTime: "22:00", endTime: "02:00" },
    ];
    expect(parseRosterCell(formatRosterCell(staff))).toEqual(staff);
    expect(parseRosterCell("Ann\nann\n\n")).toEqual([{ name: "Ann", startTime: "", endTime: "" }]);
  });
});
