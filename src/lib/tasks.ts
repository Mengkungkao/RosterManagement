// Task types (Settings → Task types) and the tasks an event needs. Pure
// functions only.
//
// A task type is a reusable template ("Bartender / Bar Service": needs RSA and
// a trained bartender). An event lists the tasks it needs — each a copy of a
// type's requirements with its own headcount and times, which the manager can
// adjust without changing the type or other events.

import { TIME_PATTERN } from "./availability";
import { isSkillId, isSkillLevel, makeId, type SkillLevel } from "./skills";

export const TASK_GROUPS = ["setup", "service", "leadership"] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];
export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  setup: "Setup and pack-down",
  service: "Food and beverage",
  leadership: "Leadership and specialist",
};

// When a task normally happens, used for its default times on an event.
export const TASK_PHASES = ["setup", "event", "packdown", "whole"] as const;
export type TaskPhase = (typeof TASK_PHASES)[number];
export const TASK_PHASE_LABELS: Record<TaskPhase, string> = {
  setup: "Before the event (setup)",
  event: "During the event",
  packdown: "After the event (pack-down)",
  whole: "Setup to pack-down",
};

export const DEMANDS = ["low", "moderate", "high"] as const;
export type Demand = (typeof DEMANDS)[number];
export const DEMAND_LABELS: Record<Demand, string> = {
  low: "Low",
  moderate: "Moderate manual handling",
  high: "Heavy manual handling",
};

export const MAX_TEAM = 10;
export const MAX_TASK_COUNT = 100;

// What a task asks of the people on it. Shared by task types and event tasks.
export interface TaskRequirements {
  skillId: string; // "" = none; otherwise used for ranking, and required when minLevel is set
  minLevel: SkillLevel | ""; // "" = anyone may do it (experienced people ranked first)
  qualificationIds: string[]; // must be held and current (e.g. RSA)
  demand: Demand;
  minTeam: number; // people who must work it together (team lifting); 1 = alone is fine
  controls: string; // equipment or method needed to do it safely ("" = none)
  needsSupervisor: boolean; // a supervisor or team leader must be on the event at the time
  leadership: boolean; // this is itself a supervisor / team leader role
  combinable: boolean; // its staff may do another combinable task at the same time
}

export interface TaskType extends TaskRequirements {
  id: string;
  name: string;
  group: TaskGroup;
  phase: TaskPhase;
  active: boolean;
}

export interface EventTask extends TaskRequirements {
  id: string; // unique within the event
  typeId: string; // the task type it came from; "" for the general "Event staff" task
  name: string; // unique within the event
  count: number; // workers needed at every moment of the task
  startTime: string; // HH:MM; "" for both = the event's whole shift (setup → pack-down)
  endTime: string;
  notes: string; // instructions for the staff on it
  mandatory: boolean; // optional tasks are filled after the mandatory ones and never block "fully staffed"
  controlsConfirmed: boolean; // the manager has confirmed the safety controls are in place
}

export const GENERAL_TASK_ID = "main";
export const GENERAL_TASK_NAME = "Event staff";

const req = (r: Partial<TaskRequirements>): TaskRequirements => ({
  skillId: "",
  minLevel: "",
  qualificationIds: [],
  demand: "low",
  minTeam: 1,
  controls: "",
  needsSupervisor: false,
  leadership: false,
  combinable: false,
  ...r,
});

const type = (
  id: string,
  name: string,
  group: TaskGroup,
  phase: TaskPhase,
  r: Partial<TaskRequirements>
): TaskType => ({ id, name, group, phase, active: true, ...req(r) });

// Built-in task types. Defaults only — managers change them in Settings.
export const DEFAULT_TASK_TYPES: TaskType[] = [
  type("hard_setup", "Hard Setup / Heavy Setup", "setup", "setup", {
    skillId: "hard_setup",
    minLevel: "trained",
    qualificationIds: ["manual_handling"],
    demand: "high",
    minTeam: 2,
    controls: "Trolleys or table lifters; team lift tables and staging",
    needsSupervisor: true,
  }),
  type("soft_setup", "Soft Setup / Table Setup", "setup", "setup", { skillId: "soft_setup" }),
  type("furniture_setup", "Furniture and Equipment Setup", "setup", "setup", {
    skillId: "hard_setup",
    minLevel: "trained",
    qualificationIds: ["manual_handling"],
    demand: "high",
    minTeam: 2,
    controls: "Trolleys or mechanical aids for heavy items",
  }),
  type("av_setup", "AV and Conference Setup", "setup", "setup", {
    skillId: "av_setup",
    minLevel: "trained",
    demand: "moderate",
  }),
  type("pack_down", "Pack-down and Room Reset", "setup", "packdown", { skillId: "pack_down", demand: "moderate" }),
  type("cleaning", "Cleaning and Closing", "setup", "packdown", { skillId: "cleaning", demand: "moderate" }),
  type("food_service", "Food Service / Waitstaff", "service", "event", { skillId: "banquet_service" }),
  type("food_running", "Food Running", "service", "event", { skillId: "food_running", demand: "moderate" }),
  type("barista", "Barista", "service", "event", { skillId: "barista", minLevel: "trained" }),
  type("bartender", "Bartender / Bar Service", "service", "event", {
    skillId: "bartending",
    minLevel: "trained",
    qualificationIds: ["rsa"],
    combinable: true,
  }),
  type("buffet", "Buffet and Food Station", "service", "event", { skillId: "buffet" }),
  type("bar_stock", "Bar Stock and Replenishment", "service", "event", {
    skillId: "bar_stock",
    demand: "moderate",
    combinable: true,
  }),
  type("beverage_prep", "Beverage Preparation", "service", "event", { skillId: "beverage_prep", combinable: true }),
  type("supervisor", "Event Supervisor", "leadership", "whole", {
    skillId: "supervision",
    minLevel: "qualified",
    leadership: true,
  }),
  type("team_leader", "Team Leader", "leadership", "whole", {
    skillId: "team_leading",
    minLevel: "trained",
    leadership: true,
  }),
  type("conference_support", "Conference Support", "leadership", "event", {
    skillId: "conference_support",
    combinable: true,
  }),
  type("guest_assistance", "Guest Assistance", "leadership", "event", {
    skillId: "guest_assistance",
    combinable: true,
  }),
  type("other", "Other / Custom Task", "leadership", "event", {}),
];

// A task that can't be made safe by a manager's say-so: heavy work, team
// lifting or required equipment. Its skill requirement can't be overridden,
// and it can never be combined with another task.
export function isSafetyCritical(r: TaskRequirements): boolean {
  return r.demand === "high" || r.minTeam > 1 || r.controls.trim() !== "";
}

export function requirementsOf(t: TaskRequirements): TaskRequirements {
  return {
    skillId: t.skillId,
    minLevel: t.minLevel,
    qualificationIds: [...t.qualificationIds],
    demand: t.demand,
    minTeam: t.minTeam,
    controls: t.controls,
    needsSupervisor: t.needsSupervisor,
    leadership: t.leadership,
    combinable: t.combinable && !isSafetyCritical(t),
  };
}

// The implicit task of an event saved before tasks existed (or that only
// needs general staff): "Staff needed" people for the whole shift.
export function generalTask(count: number): EventTask {
  return {
    id: GENERAL_TASK_ID,
    typeId: "",
    name: GENERAL_TASK_NAME,
    count,
    startTime: "",
    endTime: "",
    notes: "",
    mandatory: true,
    controlsConfirmed: false,
    ...req({}),
  };
}

// --- Default times -------------------------------------------------------------

export interface EventTimes {
  start: number; // minutes from midnight of the event's date
  end: number; // > start
  setupMinutes: number;
  packDownMinutes: number;
}

export function phaseWindow(phase: TaskPhase, t: EventTimes): { start: number; end: number } {
  const setup = Math.max(t.setupMinutes, 30);
  const packDown = Math.max(t.packDownMinutes, 30);
  switch (phase) {
    case "setup":
      return { start: t.start - setup, end: t.start };
    case "packdown":
      return { start: t.end, end: t.end + packDown };
    case "whole":
      return { start: t.start - t.setupMinutes, end: t.end + t.packDownMinutes };
    default:
      return { start: t.start, end: t.end };
  }
}

// A unique name within the event: "Food Service / Waitstaff", "… 2".
export function uniqueTaskName(name: string, tasks: { name: string }[]): string {
  const taken = (n: string) => tasks.some((t) => t.name.toLowerCase() === n.toLowerCase());
  if (!taken(name)) return name;
  let n = 2;
  while (taken(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

export function uniqueTaskId(tasks: { id: string }[]): string {
  let n = tasks.length + 1;
  while (tasks.some((t) => t.id === `t${n}`)) n++;
  return `t${n}`;
}

// --- Storage and request parsing -------------------------------------------------

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

function parseRequirements(v: Record<string, unknown>, fallback: TaskRequirements): TaskRequirements {
  const demand = (DEMANDS as readonly string[]).includes(v.demand as string) ? (v.demand as Demand) : fallback.demand;
  const team = Number(v.minTeam);
  const r: TaskRequirements = {
    skillId: v.skillId === "" ? "" : isSkillId(v.skillId) ? v.skillId : fallback.skillId,
    minLevel: v.minLevel === "" ? "" : isSkillLevel(v.minLevel) ? v.minLevel : fallback.minLevel,
    qualificationIds: Array.isArray(v.qualificationIds)
      ? [...new Set(v.qualificationIds.filter(isSkillId))]
      : [...fallback.qualificationIds],
    demand,
    minTeam: Number.isInteger(team) && team >= 1 && team <= MAX_TEAM ? team : fallback.minTeam,
    controls: v.controls === undefined ? fallback.controls : text(v.controls, 200),
    needsSupervisor: bool(v.needsSupervisor, fallback.needsSupervisor),
    leadership: bool(v.leadership, fallback.leadership),
    combinable: bool(v.combinable, fallback.combinable),
  };
  if (!r.skillId) r.minLevel = "";
  if (isSafetyCritical(r)) r.combinable = false;
  return r;
}

// The Events tab's Tasks cell: JSON. Returns null if it has text that can't
// be read (the row is then kept untouched and reported, never overwritten).
export function parseTasksCell(cell: string): EventTask[] | null {
  if (!cell.trim()) return [];
  try {
    const data = JSON.parse(cell);
    if (!Array.isArray(data)) return null;
    const tasks: EventTask[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) return null;
      const v = item as Record<string, unknown>;
      const name = text(v.name, 80);
      const id = text(v.id, 20);
      if (!name || !id || tasks.some((t) => t.id === id)) return null;
      const count = Number(v.count);
      const startTime = text(v.startTime);
      const endTime = text(v.endTime);
      const timed = TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);
      tasks.push({
        id,
        typeId: text(v.typeId, 40),
        name: uniqueTaskName(name, tasks),
        count: Number.isInteger(count) && count >= 0 && count <= MAX_TASK_COUNT ? count : 1,
        startTime: timed ? startTime : "",
        endTime: timed ? endTime : "",
        notes: text(v.notes, 1000),
        mandatory: bool(v.mandatory, true),
        controlsConfirmed: bool(v.controlsConfirmed, false),
        ...parseRequirements(v, req({})),
      });
    }
    return tasks;
  } catch {
    return null;
  }
}

export function formatTasksCell(tasks: EventTask[]): string {
  return tasks.length === 0 ? "" : JSON.stringify(tasks);
}

// Validates an event's tasks sent from the app. Returns an error or the tasks.
export function parseTasksInput(input: unknown): EventTask[] | string {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return "Invalid tasks";
  const tasks: EventTask[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) return "Invalid task";
    const v = item as Record<string, unknown>;
    const name = text(v.name, 80);
    if (!name) return "Every task needs a name";
    if (tasks.some((t) => t.name.toLowerCase() === name.toLowerCase())) return `There are two tasks called "${name}"`;
    const count = Number(v.count);
    if (!Number.isInteger(count) || count < 0 || count > MAX_TASK_COUNT) {
      return `${name}: workers needed must be a whole number from 0 to ${MAX_TASK_COUNT}`;
    }
    const startTime = text(v.startTime);
    const endTime = text(v.endTime);
    const general = startTime === "" && endTime === "";
    if (!general && !(TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime))) {
      return `${name}: start and end must be times`;
    }
    if (!general && startTime === endTime) return `${name}: must end at a different time than it starts`;
    const r = parseRequirements(v, req({}));
    if (r.minTeam > 1 && count > 0 && count < r.minTeam) {
      return `${name}: needs at least ${r.minTeam} workers, because it's done as a team of ${r.minTeam}`;
    }
    let id = text(v.id, 20);
    if (!/^[a-z0-9_-]+$/i.test(id) || tasks.some((t) => t.id === id)) id = uniqueTaskId(tasks);
    tasks.push({
      id,
      typeId: text(v.typeId, 40),
      name,
      count,
      startTime,
      endTime,
      notes: text(v.notes, 1000),
      mandatory: bool(v.mandatory, true),
      controlsConfirmed: bool(v.controlsConfirmed, false) && r.controls !== "",
      ...r,
    });
  }
  return tasks;
}

// Validates the list from Settings → Task types.
export function parseTaskTypesInput(input: unknown): TaskType[] | string {
  if (!Array.isArray(input)) return "Invalid task types";
  const types: TaskType[] = [];
  for (const item of input) {
    const v = (item ?? {}) as Record<string, unknown>;
    const name = text(v.name, 80);
    if (!name) return "Every task type needs a name";
    if (types.some((t) => t.name.toLowerCase() === name.toLowerCase())) return `"${name}" is listed twice`;
    const id = isSkillId(v.id) && !types.some((t) => t.id === v.id) ? v.id : makeId(name, types.map((t) => t.id));
    types.push({
      id,
      name,
      group: (TASK_GROUPS as readonly string[]).includes(v.group as string) ? (v.group as TaskGroup) : "service",
      phase: (TASK_PHASES as readonly string[]).includes(v.phase as string) ? (v.phase as TaskPhase) : "event",
      active: v.active !== false,
      ...parseRequirements(v, req({})),
    });
  }
  return types;
}

// --- The Task Types sheet tab ------------------------------------------------------

export const TASK_TYPES_HEADER = [
  "Order",
  "ID",
  "Name",
  "Group",
  "Phase",
  "Skill",
  "Minimum Level",
  "Qualifications",
  "Physical Demand",
  "Team Size",
  "Safety Controls",
  "Leadership Role",
  "Needs Supervisor",
  "Can Combine",
  "Active",
];

const yes = (cell: string | undefined) => /^(yes|y|true|1)$/i.test((cell ?? "").trim());
const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function taskTypesToRows(types: TaskType[]): string[][] {
  return [
    TASK_TYPES_HEADER,
    ...types.map((t, i) => [
      String(i + 1),
      t.id,
      t.name,
      t.group,
      t.phase,
      t.skillId,
      t.minLevel,
      t.qualificationIds.join(", "),
      t.demand,
      String(t.minTeam),
      t.controls,
      yesNo(t.leadership),
      yesNo(t.needsSupervisor),
      yesNo(t.combinable),
      yesNo(t.active),
    ]),
  ];
}

// Rows from the tab (header excluded). An empty tab means the built-in list.
export function parseTaskTypeRows(rows: string[][]): TaskType[] {
  const types: TaskType[] = [];
  for (const r of rows) {
    const name = (r[2] ?? "").trim();
    if (!name) continue;
    const id = isSkillId((r[1] ?? "").trim()) ? r[1].trim() : makeId(name, types.map((t) => t.id));
    if (types.some((t) => t.id === id)) continue;
    const parsed = parseTaskTypesInput([
      {
        id,
        name,
        group: (r[3] ?? "").trim(),
        phase: (r[4] ?? "").trim(),
        skillId: (r[5] ?? "").trim(),
        minLevel: (r[6] ?? "").trim(),
        qualificationIds: (r[7] ?? "").split(/[\s,;]+/).filter(Boolean),
        demand: (r[8] ?? "").trim().toLowerCase(),
        minTeam: Number(r[9] || 1),
        controls: r[10] ?? "",
        leadership: yes(r[11]),
        needsSupervisor: yes(r[12]),
        combinable: yes(r[13]),
        active: (r[14] ?? "").trim() === "" ? true : yes(r[14]),
      },
    ]);
    if (typeof parsed !== "string") types.push(parsed[0]);
  }
  return types.length > 0 ? types : DEFAULT_TASK_TYPES;
}

// A new event task from a type, at the type's usual time for this event.
export function taskFromType(
  t: TaskType,
  count: number,
  window: { start: number; end: number },
  existing: EventTask[],
  format: (minutes: number) => string
): EventTask {
  return {
    id: uniqueTaskId(existing),
    typeId: t.id,
    name: uniqueTaskName(t.name, existing),
    count: Math.max(count, t.minTeam),
    startTime: format(window.start),
    endTime: format(window.end),
    notes: "",
    mandatory: true,
    controlsConfirmed: false,
    ...requirementsOf(t),
  };
}
