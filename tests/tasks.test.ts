import { describe, expect, it } from "vitest";
import { formatRosterCell, parseRosterCell } from "@/lib/events";
import {
  applyProposals,
  buildContext,
  checkRosterChange,
  clearUnlocked,
  eventIssues,
  eventStaffing,
  generateRoster,
  listShifts,
  rankForTask,
  summarizeHours,
  taskStatuses,
  taskWindow,
  formatWindow,
} from "@/lib/roster";
import { DEFAULT_SKILLS } from "@/lib/skills";
import { formatTasksCell, parseTasksCell, parseTasksInput } from "@/lib/tasks";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { calculateWages } from "@/lib/wages";
import { ANCHOR, FORTNIGHT, OFF, event, person, skill, task, week } from "./helpers";

const options = { skills: DEFAULT_SKILLS };
const on = (name: string, taskId: string, extra: Record<string, unknown> = {}) => ({
  name,
  startTime: "",
  endTime: "",
  taskId,
  ...extra,
});
const names = (e: { staff: { name: string; taskId?: string }[] }, taskId: string) =>
  e.staff.filter((s) => s.taskId === taskId).map((s) => s.name);

// The persona from the brief.
const persona = {
  ...person("Pia"),
  skills: {
    banquet_service: skill("experienced"),
    soft_setup: skill("trained"),
    barista: skill("qualified"),
    bartending: skill("learning"),
  },
};

const hardSetup = task({
  id: "hard",
  name: "Hard Setup",
  startTime: "14:00",
  endTime: "16:00",
  count: 2,
  skillId: "hard_setup",
  minLevel: "trained",
  qualificationIds: ["manual_handling"],
  demand: "high",
  minTeam: 2,
});
const softSetup = task({ id: "soft", name: "Soft Setup", startTime: "14:00", endTime: "16:00", skillId: "soft_setup" });
const foodService = task({ id: "food", name: "Food Service", skillId: "banquet_service" });
const barista = task({ id: "barista", name: "Barista", skillId: "barista", minLevel: "trained" });
const bartender = task({
  id: "bar",
  name: "Bartender",
  skillId: "bartending",
  minLevel: "trained",
  qualificationIds: ["rsa"],
  combinable: true,
});
const supervisor = task({
  id: "sup",
  name: "Event Supervisor",
  startTime: "14:00",
  endTime: "23:00",
  skillId: "supervision",
  minLevel: "qualified",
  leadership: true,
});

function generate(events: ReturnType<typeof event>[], staff: ReturnType<typeof person>[]) {
  return generateRoster(events, staff, FORTNIGHT, ANCHOR, "", options);
}

describe("skills decide who can be rostered", () => {
  it("recommends the persona for service, soft setup and barista work, never hard setup or the bar", () => {
    const e = event({ tasks: [hardSetup, softSetup, foodService, barista, bartender, supervisor] });
    const ctx = buildContext([persona], [], ANCHOR, options);
    const eligible = (t: typeof foodService) =>
      rankForTask(e, t, taskWindow(e, t), ctx).filter((c) => c.blockers.length === 0).map((c) => c.staffName);
    expect(eligible(foodService)).toEqual(["Pia"]);
    expect(eligible(softSetup)).toEqual(["Pia"]);
    expect(eligible(barista)).toEqual(["Pia"]);
    expect(eligible(hardSetup)).toEqual([]);
    expect(eligible(bartender)).toEqual([]);
    expect(eligible(supervisor)).toEqual([]);

    const [hard] = rankForTask(e, hardSetup, taskWindow(e, hardSetup), ctx);
    expect(hard.problems.map((p) => [p.code, p.overridable])).toEqual([
      ["qualification", false],
      ["skill", false], // heavy team work: can't be overridden
    ]);
    const [bar] = rankForTask(e, bartender, taskWindow(e, bartender), ctx);
    expect(bar.blockers).toEqual([
      "No RSA (Responsible Service of Alcohol) on file",
      "Bartending: Learning (needs Trained)",
    ]);
  });

  it("never auto-assigns a mandatory task to someone without the verified skill, and says why", () => {
    const e = event({ tasks: [barista] });
    const result = generate([e], [person("New")]);
    expect(result.proposals).toEqual([]);
    expect(result.gaps[0]).toMatchObject({ taskName: "Barista", missing: 1 });
    expect(result.gaps[0].reasons).toEqual([{ code: "skill", label: "skill not verified", count: 1 }]);
  });

  it("treats an expired qualification or skill check as not held", () => {
    const e = event({ tasks: [bartender] });
    const sam = { ...person("Sam"), skills: { bartending: skill("experienced"), rsa: skill("qualified", "2026-09-30") } };
    const [c] = rankForTask(e, bartender, taskWindow(e, bartender), buildContext([sam], [], ANCHOR, options));
    expect(c.blockers).toEqual(["RSA (Responsible Service of Alcohol) expired 2026-09-30"]);
    const renewed = { ...sam, skills: { ...sam.skills, rsa: skill("qualified", "2029-09-30") } };
    expect(generate([e], [renewed]).proposals.map((p) => p.staffName)).toEqual(["Sam"]);
  });

  it("ranks experienced staff first and explains the recommendation", () => {
    const e = event({ tasks: [foodService] });
    const staff = [person("Ann"), { ...person("Ben"), skills: { banquet_service: skill("experienced") } }];
    const result = generate([e], staff);
    expect(result.proposals[0].staffName).toBe("Ben");
    expect(result.proposals[0].reason).toBe(
      "Recommended: Experienced: Banquet / food service; Available for the whole shift; 0h this fortnight, under 76h"
    );
  });

  it("keeps hour rules ahead of experience: part-timers short of their minimum still come first", () => {
    const e = event({ tasks: [foodService] });
    const staff = [{ ...person("Exp"), skills: { banquet_service: skill("experienced") } }, person("Pat", "part_time")];
    expect(generate([e], staff).proposals[0].staffName).toBe("Pat");
  });
});

describe("work restrictions and safety", () => {
  it("keeps someone with a manual-handling restriction off heavy and moderate work, but not light work", () => {
    const pack = task({ id: "pack", name: "Pack-down", startTime: "22:00", endTime: "23:00", demand: "moderate" });
    const e = event({ tasks: [pack, foodService] });
    const rex = { ...person("Rex"), restrictions: [{ type: "no_manual_handling" as const, note: "", until: "2026-12-01" }] };
    const ctx = buildContext([rex], [], ANCHOR, options);
    expect(rankForTask(e, pack, taskWindow(e, pack), ctx)[0].blockers).toEqual([
      "Work restriction: No manual handling until 2026-12-01",
    ]);
    expect(rankForTask(e, foodService, taskWindow(e, foodService), ctx)[0].blockers).toEqual([]);
    // After the restriction ends it no longer applies.
    const later = event({ date: "2026-12-08", tasks: [pack] });
    expect(rankForTask(later, pack, taskWindow(later, pack), ctx)[0].blockers).toEqual([]);
  });

  it("fills a team lift with a whole team or no one", () => {
    const qualified = (name: string) => ({
      ...person(name),
      skills: { hard_setup: skill("trained"), manual_handling: skill("qualified") },
    });
    const confirmed = { ...hardSetup, controls: "Trolleys", controlsConfirmed: true };
    const one = generate([event({ tasks: [confirmed] })], [qualified("Ann"), person("Ben")]);
    expect(one.proposals).toEqual([]);
    expect(one.gaps[0].note).toBe("Done as a team of 2: not enough eligible people at the same time");

    const two = generate([event({ tasks: [confirmed] })], [qualified("Ann"), qualified("Ben")]);
    expect(two.proposals.map((p) => p.staffName)).toEqual(["Ann", "Ben"]);
  });

  it("leaves a task whose safety controls aren't confirmed for the manager", () => {
    const withControls = { ...softSetup, controls: "Table trolley" };
    const result = generate([event({ tasks: [withControls] })], [person("Ann")]);
    expect(result.proposals).toEqual([]);
    expect(result.gaps[0].note).toBe("Not filled until the safety controls are confirmed: Table trolley");
  });

  it("never counts a task as fully staffed while a team task has too few people or controls aren't confirmed", () => {
    const qualified = { ...person("Ann"), skills: { hard_setup: skill("trained"), manual_handling: skill("qualified") } };
    const e = event({ tasks: [{ ...hardSetup, controls: "Trolleys", controlsConfirmed: true }], staff: [on("Ann", "hard")] });
    const [status] = taskStatuses(e, buildContext([qualified], listShifts([e]), ANCHOR, options));
    expect(status.filled).toBe(false);
    expect(status.unsafe.map(formatWindow)).toEqual(["14:00–16:00"]);
    expect(eventIssues(e, [status]).map((i) => i.text)).toContain(
      "Hard Setup is done as a team of 2 — not enough people on at 14:00–16:00"
    );
  });

  it("warns when a task that needs a supervisor has none on the event", () => {
    const watched = { ...softSetup, needsSupervisor: true };
    const e = event({ tasks: [watched, supervisor] });
    const ctx = buildContext([], [], ANCHOR, options);
    expect(eventIssues(e, taskStatuses(e, ctx)).map((i) => i.text)).toEqual([
      "Soft Setup needs a supervisor or team leader on the event at 14:00–16:00",
    ]);
  });
});

describe("coverage is counted over time, one person at a time", () => {
  it("doesn't call a task staffed when two people only cover half each", () => {
    const e = event({
      tasks: [{ ...foodService, count: 2 }],
      staff: [on("Ann", "food", { startTime: "17:00", endTime: "19:30" }), on("Ben", "food", { startTime: "19:30", endTime: "22:00" })],
    });
    const [status] = taskStatuses(e, buildContext([person("Ann"), person("Ben")], listShifts([e]), ANCHOR, options));
    expect(status.covered).toBe(1);
    expect(status.filled).toBe(false);
  });

  it("never lets one person count twice towards tasks at the same time", () => {
    const staff = [{ ...person("Pia"), skills: { barista: skill("trained") } }];
    const result = generate([event({ tasks: [foodService, barista] })], staff);
    expect(result.proposals).toHaveLength(1);
    expect(result.gaps).toHaveLength(1);
    // Adding her to the second one by hand is refused.
    const e = result.events[0];
    const both = { ...e, staff: [...e.staff, on("Pia", result.proposals[0].taskId === "food" ? "barista" : "food")] };
    expect(checkRosterChange(both, e.staff, buildContext(staff, listShifts([both]), ANCHOR, options))).toMatch(
      /^Pia can't work .*: Already on /
    );
  });

  it("lets one person do two tasks at once only when both are marked as combinable", () => {
    const stock = task({ id: "stock", name: "Bar Stock", combinable: true });
    const staff = [{ ...person("Bo"), skills: { bartending: skill("trained"), rsa: skill("qualified") } }];
    const result = generate([event({ tasks: [bartender, stock] })], staff);
    expect(result.proposals.map((p) => [p.taskName, p.staffName])).toEqual([
      ["Bartender", "Bo"],
      ["Bar Stock", "Bo"],
    ]);
    const [row] = summarizeHours(staff, listShifts(result.events), FORTNIGHT);
    expect(row.total).toBe(5); // 17:00–22:00 counted once
  });

  it("moves a worker between tasks when the times don't overlap, counting their time once", () => {
    const staff = [{ ...person("Pia"), skills: { soft_setup: skill("trained") } }];
    const result = generate([event({ tasks: [softSetup, foodService] })], staff);
    expect(result.proposals.map((p) => `${p.taskName} ${formatWindow(p.window)}`)).toEqual([
      "Soft Setup 14:00–16:00",
      "Food Service 17:00–22:00",
    ]);
    const shifts = listShifts(result.events);
    expect(summarizeHours(staff, shifts, FORTNIGHT)[0].total).toBe(7);
    const wages = calculateWages(
      [{ staffName: "Pia", employmentType: "casual", awardLevel: "level1" }],
      shifts,
      DEFAULT_SETTINGS,
      FORTNIGHT
    );
    expect(wages.lines[0].workedHours).toBe(7);
  });

  it("works out a task's times across midnight", () => {
    const late = event({ startTime: "20:00", endTime: "01:00" });
    const packDown = task({ id: "p", name: "Pack-down", startTime: "01:00", endTime: "02:00" });
    expect(taskWindow(late, packDown)).toEqual({ start: 25 * 60, end: 26 * 60 });
    const setup = task({ id: "s", name: "Setup", startTime: "18:00", endTime: "20:00" });
    expect(taskWindow(late, setup)).toEqual({ start: 18 * 60, end: 20 * 60 });
  });
});

describe("generating a draft roster", () => {
  it("fills the most constrained task first", () => {
    // Bea is the only barista, and first on the list for food service too.
    const staff = [{ ...person("Bea"), skills: { barista: skill("trained") } }, person("Finn")];
    const result = generate([event({ tasks: [foodService, barista] })], staff);
    expect(result.proposals.map((p) => [p.taskName, p.staffName])).toEqual([
      ["Barista", "Bea"],
      ["Food Service", "Finn"],
    ]);
  });

  it("keeps everyone already rostered, locked or not", () => {
    const e = event({
      tasks: [{ ...foodService, count: 2 }],
      staff: [on("Ann", "food", { locked: true })],
    });
    const result = generate([e], [person("Ann"), person("Ben"), person("Cat")]);
    expect(names(result.events[0], "food")).toEqual(["Ann", "Ben"]);
    expect(result.proposals.map((p) => p.staffName)).toEqual(["Ben"]);
  });

  it("re-checks a draft when it is applied and skips what no longer fits", () => {
    const e = event({ tasks: [foodService] });
    const draft = generate([e], [person("Ann")]);
    const nowOff = [person("Ann", "casual", week({}, OFF))];
    const result = applyProposals([e], draft.proposals, nowOff, ANCHOR, options);
    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([{ staffName: "Ann", eventName: "Event", reason: "No longer available for the whole shift" }]);
    expect(applyProposals([e], draft.proposals, [person("Ann")], ANCHOR, options).applied).toBe(1);
  });

  it("applies a team task's proposals together or not at all", () => {
    const qualified = (name: string) => ({ ...person(name), skills: { hard_setup: skill("trained"), manual_handling: skill("qualified") } });
    const e = event({ tasks: [{ ...hardSetup, controls: "Trolleys", controlsConfirmed: true }] });
    const draft = generate([e], [qualified("Ann"), qualified("Ben")]);
    const onlyAnn = applyProposals([e], draft.proposals.slice(0, 1), [qualified("Ann"), qualified("Ben")], ANCHOR, options);
    expect(onlyAnn.applied).toBe(0);
    expect(onlyAnn.skipped[0].reason).toBe("Hard Setup needs a team of 2 together");
  });

  it("Clear takes off everyone except locked people, from the given day on", () => {
    const past = event({ date: "2026-10-13", staff: [on("Ann", "main")] });
    const next = event({ date: "2026-10-22", staff: [on("Ben", "main", { locked: true }), on("Cat", "main")] });
    const result = clearUnlocked([past, next], "2026-10-20", "2026-10-25");
    expect(result.events.map((e) => e.staff.map((s) => s.name))).toEqual([["Ann"], ["Ben"]]);
    expect([result.cleared, result.kept]).toEqual([1, 1]);
  });

  it("doesn't roster anyone who asked for that day off, or anyone inactive", () => {
    const e = event({ tasks: [foodService] });
    const away = {
      ...person("Ann"),
      requests: [
        { id: "r1", kind: "time_off" as const, from: "2026-10-20", to: "2026-10-21", eventId: "", eventName: "", note: "", status: "pending" as const, submitted: "", decided: "" },
      ],
    };
    const gone = { ...person("Ben"), active: false };
    const result = generate([e], [away, gone]);
    expect(result.proposals).toEqual([]);
    expect(result.gaps[0].reasons).toEqual([{ code: "time_off", label: "on leave or asked for time off", count: 1 }]);
    const declined = { ...away, requests: [{ ...away.requests[0], status: "declined" as const }] };
    expect(generate([e], [declined]).proposals.map((p) => p.staffName)).toEqual(["Ann"]);
  });
});

describe("manual changes", () => {
  const ctxFor = (e: ReturnType<typeof event>, staff: ReturnType<typeof person>[]) =>
    buildContext(staff, listShifts([e]), ANCHOR, options);

  it("needs a reason to roster someone outside their availability, and records it", () => {
    const off = [person("Ann", "casual", week({}, OFF))];
    const added = event({ tasks: [foodService], staff: [on("Ann", "food")] });
    expect(checkRosterChange(added, [], ctxFor(added, off))).toBe(
      "Ann: Isn't available for all of 17:00–22:00. Give a reason to roster them anyway."
    );
    const withReason = event({ tasks: [foodService], staff: [on("Ann", "food", { override: "Swapped with Ben" })] });
    expect(checkRosterChange(withReason, [], ctxFor(withReason, off))).toBeNull();
    const [status] = taskStatuses(withReason, ctxFor(withReason, off));
    expect(status.covered).toBe(1);
    expect(eventIssues(withReason, [status])).toEqual([
      {
        severity: "info",
        text: "Ann isn't available for all of 17:00–22:00 — rostered anyway: “Swapped with Ben”",
        taskId: "food",
        staffName: "Ann",
      },
    ]);
  });

  it("refuses an override for safety, legal or authorisation checks", () => {
    const e = event({ tasks: [bartender], staff: [on("Ann", "bar", { override: "Busy night" })] });
    expect(checkRosterChange(e, [], ctxFor(e, [person("Ann")]))).toBe(
      "Ann can't work Bartender: No RSA (Responsible Service of Alcohol) on file"
    );
  });

  it("lets a trainee on a light task with a reason, and doesn't count them without one", () => {
    const e = event({ tasks: [barista], staff: [on("Lee", "barista")] });
    const lee = [{ ...person("Lee"), skills: { barista: skill("learning") } }];
    expect(checkRosterChange(e, [], ctxFor(e, lee))).toBe(
      "Lee: Barista: Learning (needs Trained). Give a reason to roster them anyway."
    );
    expect(taskStatuses(e, ctxFor(e, lee))[0].covered).toBe(0);
  });
});

describe("storing tasks in the Events tab", () => {
  it("round-trips tasks and the people on them, readably", () => {
    const tasks = [softSetup, foodService];
    expect(parseTasksCell(formatTasksCell(tasks))).toEqual(tasks);
    const staff = [
      { name: "Ann", startTime: "", endTime: "", taskId: "soft" },
      { name: "Ann", startTime: "", endTime: "", taskId: "food", locked: true },
      { name: "Ben", startTime: "18:00", endTime: "22:00", taskId: "food", override: "Leaving early · ok" },
    ];
    const cell = formatRosterCell(staff, tasks);
    expect(cell).toBe(
      "Ann · Soft Setup\nAnn · Food Service · locked\nBen 18:00-22:00 · Food Service · override: Leaving early ok"
    );
    expect(parseRosterCell(cell, tasks)).toEqual([staff[0], staff[1], { ...staff[2], override: "Leaving early ok" }]);
  });

  it("writes events without tasks in the original format", () => {
    expect(formatRosterCell([{ name: "Ann", startTime: "", endTime: "" }, { name: "Ben", startTime: "19:00", endTime: "23:00" }])).toBe(
      "Ann\nBen 19:00-23:00"
    );
  });

  it("refuses a team task with fewer workers than the team size", () => {
    expect(parseTasksInput([{ ...hardSetup, count: 1 }])).toBe(
      "Hard Setup: needs at least 2 workers, because it's done as a team of 2"
    );
  });

  it("never marks heavy or team work as combinable", () => {
    const parsed = parseTasksInput([{ ...hardSetup, combinable: true }]);
    expect(typeof parsed !== "string" && parsed[0].combinable).toBe(false);
  });

  it("reports a Tasks cell it can't read instead of guessing", () => {
    expect(parseTasksCell("[{broken")).toBeNull();
    expect(parseTasksCell("")).toEqual([]);
  });
});

describe("event staffing summary", () => {
  it("counts positions per task, up to what each needs", () => {
    const e = event({
      tasks: [{ ...foodService, count: 2 }, softSetup],
      staff: [on("Ann", "food"), on("Ben", "food"), on("Cat", "food")],
    });
    const ctx = buildContext([person("Ann"), person("Ben"), person("Cat")], listShifts([e]), ANCHOR, options);
    expect(eventStaffing(e, taskStatuses(e, ctx))).toMatchObject({ filled: 2, needed: 3, people: 3, complete: false });
  });
});

describe("explaining an open position", () => {
  it("says when the people who could do team work are too few for a safe team", () => {
    const qualified = { ...person("Ann"), skills: { hard_setup: skill("trained"), manual_handling: skill("qualified") } };
    const e = event({ tasks: [{ ...hardSetup, controls: "Trolleys", controlsConfirmed: true }] });
    const result = generate([e], [qualified, person("Ben")]);
    expect(result.gaps[0].reasons).toEqual([
      { code: "qualification", label: "missing or expired qualification", count: 1 },
      { code: "team", label: "eligible, but fewer than a team of 2", count: 1 },
    ]);
  });
});
