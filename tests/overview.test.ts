import { describe, expect, it } from "vitest";
import { buildDashboard, buildFortnight, rosterStatus } from "@/lib/overview";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { DEFAULT_SKILLS } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import { FORTNIGHT, event, person, skill, task } from "./helpers";

const member = (p: ReturnType<typeof person>, extra: Partial<StaffMember> = {}): StaffMember => ({
  ...p,
  status: "",
  updatedAt: "2026-10-01 10:00:00",
  hasPassword: true,
  passwordIsPlainText: false,
  awardLevel: "level1",
  employeeId: "",
  active: true,
  skills: {},
  restrictions: [],
  preferences: [],
  requests: [],
  notes: "",
  unreadable: [],
  ...extra,
});

const bar = task({ id: "bar", name: "Bartender", skillId: "bartending", minLevel: "trained", qualificationIds: ["rsa"] });
const on = (name: string, taskId: string) => ({ name, startTime: "", endTime: "", taskId });
const status = (e: ReturnType<typeof event>, staff: StaffMember[]) =>
  rosterStatus(buildFortnight([e], staff, DEFAULT_SETTINGS, DEFAULT_SKILLS, FORTNIGHT).events[0]);

describe("roster status", () => {
  const barStaff = member(person("Bo"), { skills: { bartending: skill("trained"), rsa: skill("qualified") } });

  it("is Draft while positions are open, Ready for review once every position is filled and checked", () => {
    expect(status(event({ status: "draft", tasks: [bar] }), [barStaff]).label).toBe("Draft");
    expect(status(event({ status: "draft", tasks: [bar], staff: [on("Bo", "bar")] }), [barStaff]).label).toBe("Ready for review");
  });

  it("is Published only when published and complete; published with gaps needs attention", () => {
    expect(status(event({ tasks: [bar], staff: [on("Bo", "bar")] }), [barStaff]).label).toBe("Published");
    expect(status(event({ tasks: [bar] }), [barStaff])).toMatchObject({ key: "attention", detail: "Published with 1 open position" });
  });

  it("doesn't call a roster complete just because every position has a name", () => {
    const noRsa = member(person("Al"), { skills: { bartending: skill("experienced") } });
    const s = status(event({ status: "draft", tasks: [bar], staff: [on("Al", "bar")] }), [noRsa]);
    expect(s.key).toBe("attention");
  });
});

describe("dashboard", () => {
  it("counts the same things in the bell as it lists under Needs attention, plus requests waiting", () => {
    const e = event({ date: "2026-10-22", tasks: [bar] });
    const d = buildDashboard([e], [member(person("Al"))], DEFAULT_SETTINGS, DEFAULT_SKILLS, "2026-10-20", FORTNIGHT, 0, 2);
    expect(d.openPositions.map((i) => i.title)).toEqual(["Bartender 0/1"]);
    expect(d.openPositions[0].href).toBe(`/admin/roster?fortnight=${FORTNIGHT}&event=${e.id}&task=bar`);
    const listed = d.sheet.length + d.conflicts.length + d.openPositions.length + d.availability.length + d.expiries.length + d.hours.length;
    expect(d.attentionCount).toBe(listed + 2);
    expect(d.metrics).toMatchObject({ upcomingEvents: 1, unfilled: 1 });
  });

  it("files someone who isn't available under availability problems, not conflicts", () => {
    const e = event({ date: "2026-10-22", tasks: [task({ id: "food", name: "Food" })], staff: [on("Al", "food")] });
    const off = member(person("Al"), {
      requests: [{ id: "r", kind: "time_off", from: "2026-10-22", to: "2026-10-22", eventId: "", eventName: "", note: "", status: "approved", submitted: "", decided: "" }],
    });
    const d = buildDashboard([e], [off], DEFAULT_SETTINGS, DEFAULT_SKILLS, "2026-10-20", FORTNIGHT);
    expect(d.availability.map((i) => i.title)).toEqual(["Al: On approved leave 22 Oct"]);
    expect(d.conflicts).toEqual([]);
  });
});
