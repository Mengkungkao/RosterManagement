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
import { loadAll } from "@/lib/config-sheet";
import { createEvent } from "@/lib/events";
import { secureAllPasswords } from "@/lib/staff";
import { MemoryStore, setStoreForTesting, withLock } from "@/lib/store";
import { DEFAULT_TASK_TYPES } from "@/lib/tasks";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

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
    expect(rows[0].slice(12, 15)).toEqual(["Type", "Hourly Rate", "Award Level"]);
    expect(rows[1]).toEqual(OLD_STAFF[1]); // Ann untouched, password included
    expect(rows[2][11]).toMatch(/^scrypt\$/); // Ben's new password is stored as a hash
    expect(rows[2][11]).not.toContain("ben-pw");
    expect((await verifyStaffPassword("Ben", "ben-pw")).ok).toBe(true);
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
    expect(rows[1].slice(12, 15)).toEqual(["Full-time", "", "Introductory"]);
  });

  it("keeps an hourly rate typed in by the previous version", async () => {
    await store.writeRow("Availability", 1, [...OLD_STAFF[0], "Type", "Hourly Rate"]);
    await store.writeRow("Availability", 2, [...OLD_STAFF[1], "Casual", "31.5"]);
    await updateStaff("Ann", { awardLevel: "level3" });
    expect((await store.read("Availability"))[1].slice(12, 15)).toEqual(["Casual", "31.5", "Level 3"]);
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

describe("new profile columns", () => {
  it("keeps a cell it can't read exactly as it is, and refuses to overwrite it", async () => {
    const header = [...OLD_STAFF[0], "Type", "Hourly Rate", "Award Level", "Employee ID", "Active", "Skills"];
    await store.writeRow("Availability", 1, header);
    await store.writeRow("Availability", 2, [...OLD_STAFF[1], "Casual", "", "Level 1", "E1", "", "{not json"]);
    const [ann] = await readAllStaff();
    expect(ann.unreadable).toEqual(["Skills"]);
    expect(ann.skills).toEqual({});
    const refused = await updateStaff("Ann", { skills: { barista: { level: "trained", verifiedOn: "", verifiedBy: "", expiresOn: "" } } });
    expect(refused.ok).toBe(false);
    await updateStaff("Ann", { employmentType: "part_time" }); // other changes still save…
    expect((await store.read("Availability"))[1][SKILLS]).toBe("{not json"); // …and the cell is untouched
  });

  it("stores skills, restrictions, preferences, employee ID and active", async () => {
    await updateStaff("Ben", {
      employeeId: "E7",
      active: false,
      skills: { barista: { level: "trained", verifiedOn: "2026-10-01", verifiedBy: "Meng", expiresOn: "" } },
      restrictions: [{ type: "no_heavy", note: "", until: "2026-12-01" }],
      preferences: ["evenings", "weekends"],
      notes: "Keen to learn barista",
    });
    const ben = (await readAllStaff())[1];
    expect(ben.notes).toBe("Keen to learn barista");
    expect(ben).toMatchObject({
      employeeId: "E7",
      active: false,
      preferences: ["evenings", "weekends"],
      restrictions: [{ type: "no_heavy", note: "", until: "2026-12-01" }],
    });
    expect(ben.skills.barista.level).toBe("trained");
    const row = (await store.read("Availability"))[2];
    expect(row.slice(15, 20)).toEqual([
      "E7",
      "Inactive",
      '{"barista":{"level":"trained","verifiedOn":"2026-10-01","verifiedBy":"Meng","expiresOn":""}}',
      '[{"type":"no_heavy","note":"","until":"2026-12-01"}]',
      "Evenings, Weekends",
    ]);
    expect(row[21]).toBe("Keen to learn barista");
  });

  it("secures plain-text passwords from older rows without changing them", async () => {
    expect(await secureAllPasswords()).toBe(1); // Ann's; Ben has none
    expect((await store.read("Availability"))[1][11]).toMatch(/^scrypt\$/);
    expect((await verifyStaffPassword("Ann", "ann-pw")).ok).toBe(true);
  });
});

const SKILLS = 17;

describe("events with tasks", () => {
  it("saves tasks, status and guests and reads them back, keeping older rows as they were", async () => {
    const created = await createEvent({
      name: "Gala",
      date: "2026-10-24",
      startTime: "18:00",
      endTime: "23:00",
      location: "",
      notes: "",
      actions: [],
      staffNeeded: 0,
      setupHours: 1,
      packDownHours: 1,
      shareStaff: false,
      guests: 120,
      tasks: [
        {
          id: "t1", typeId: "food_service", name: "Food Service", count: 4, startTime: "18:00", endTime: "23:00", notes: "",
          mandatory: true, controlsConfirmed: false, skillId: "banquet_service", minLevel: "", qualificationIds: [],
          demand: "low", minTeam: 1, controls: "", needsSupervisor: false, leadership: false, combinable: false,
        },
      ],
    });
    expect(created.status).toBe("draft");
    await setEventStaff(created.id, [{ name: "Ann", startTime: "", endTime: "", taskId: "t1", locked: true }]);
    const gala = (await listEvents()).find((e) => e.id === created.id)!;
    expect(gala).toMatchObject({ status: "draft", guests: 120, staffNeeded: 4, rev: 2 });
    expect(gala.staff).toEqual([{ name: "Ann", startTime: "", endTime: "", taskId: "t1", locked: true }]);
    const row = (await store.read("Events")).find((r) => r[8] === created.id)!;
    expect(row[12]).toBe("Ann · Food Service · locked");
    // The events saved before tasks existed are still written the original way.
    const old = (await store.read("Events")).find((r) => r[8] === "id-gala")!;
    expect(old.slice(9, 15)).toEqual(["1", "1", "1", "", "", ""]);
  });

  it("refuses to remove a task someone is still on", async () => {
    const created = await createEvent({
      name: "Lunch", date: "2026-10-25", startTime: "12:00", endTime: "15:00", location: "", notes: "", actions: [],
      staffNeeded: 2, setupHours: 1, packDownHours: 1, shareStaff: false, tasks: [],
    });
    await setEventStaff(created.id, [{ name: "Ann", startTime: "", endTime: "" }]);
    const { id: _id, staff: _staff, rev: _rev, ...details } = (await listEvents()).find((e) => e.id === created.id)!;
    await expect(
      updateEvent(created.id, {
        ...details,
        tasks: [
          {
            id: "t1", typeId: "", name: "Bar", count: 1, startTime: "12:00", endTime: "15:00", notes: "", mandatory: true,
            controlsConfirmed: false, skillId: "", minLevel: "", qualificationIds: [], demand: "low", minTeam: 1,
            controls: "", needsSupervisor: false, leadership: false, combinable: false,
          },
        ],
      })
    ).rejects.toThrow("Ann is still on a task you removed");
  });

  it("catches someone else's change with the revision number", async () => {
    const [gala] = await listEvents();
    await setEventStaff(gala.id, [{ name: "Ann", startTime: "", endTime: "" }], gala.rev);
    await expect(setEventStaff(gala.id, [], gala.rev)).rejects.toThrow("Someone else changed this event");
    // Saving without changing anything doesn't count as a change.
    const [now] = await listEvents();
    await setEventStaff(now.id, now.staff, now.rev);
    expect((await listEvents())[0].rev).toBe(now.rev);
  });

  it("moves task times with the event only when asked", async () => {
    const base = {
      name: "Dinner", date: "2026-10-26", startTime: "18:00", endTime: "22:00", location: "", notes: "", actions: [],
      staffNeeded: 0, setupHours: 1, packDownHours: 1, shareStaff: false,
      tasks: [
        {
          id: "t1", typeId: "", name: "Setup", count: 1, startTime: "16:00", endTime: "18:00", notes: "", mandatory: true,
          controlsConfirmed: false, skillId: "", minLevel: "" as const, qualificationIds: [], demand: "low" as const, minTeam: 1,
          controls: "", needsSupervisor: false, leadership: false, combinable: false,
        },
      ],
    };
    const created = await createEvent(base);
    const kept = await updateEvent(created.id, { ...base, startTime: "19:00", endTime: "23:00" });
    expect(kept.tasks[0]).toMatchObject({ startTime: "16:00", endTime: "18:00" });
    const moved = await updateEvent(created.id, { ...base, startTime: "20:00", endTime: "23:59", tasks: kept.tasks }, { moveTasks: true });
    expect(moved.tasks[0]).toMatchObject({ startTime: "17:00", endTime: "19:00" });
  });
});

describe("loading everything at once", () => {
  it("uses the built-in task types and templates until their tabs exist", async () => {
    const data = await loadAll();
    expect(data.taskTypes).toEqual(DEFAULT_TASK_TYPES);
    expect(data.templates).toEqual(DEFAULT_TEMPLATES);
    expect(data.unreadableEvents).toBe(1); // the "next friday" row
    expect(data.staff.map((s) => s.staffName)).toEqual(["Ann", "Ben"]);
  });
});

describe("the write lock", () => {
  it("runs changes to one tab one after another", async () => {
    const order: string[] = [];
    const slow = withLock("tab", async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push("first");
    });
    const fast = withLock("tab", async () => {
      order.push("second");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["first", "second"]);
  });

  it("keeps going after a change fails", async () => {
    await expect(withLock("tab2", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await withLock("tab2", async () => "ok")).toBe("ok");
  });
});
