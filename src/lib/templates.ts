// Event templates: a saved staffing structure (tasks, headcounts and times
// relative to the event) for recurring weddings, conferences and dinners.
// Pure functions only.

import { formatMinutes } from "./dates";
import { isSkillId, makeId } from "./skills";
import {
  type EventTask,
  type EventTimes,
  type TaskType,
  MAX_TASK_COUNT,
  phaseWindow,
  requirementsOf,
  uniqueTaskId,
  uniqueTaskName,
} from "./tasks";

// A time relative to the event: e.g. ["start", -120] is two hours before it starts.
export type Anchor = "start" | "end";
export type RelativeTime = [Anchor, number];

export interface TemplateTask {
  typeId: string;
  name: string;
  count: number;
  from: RelativeTime;
  to: RelativeTime;
  notes: string;
}

export interface EventTemplate {
  id: string;
  name: string;
  setupHours: number;
  packDownHours: number;
  tasks: TemplateTask[];
}

const t = (typeId: string, name: string, count: number, from: RelativeTime, to: RelativeTime): TemplateTask => ({
  typeId,
  name,
  count,
  from,
  to,
  notes: "",
});

// Illustrative defaults only — the manager adjusts them to the real event.
export const DEFAULT_TEMPLATES: EventTemplate[] = [
  {
    id: "gala_dinner",
    name: "Gala dinner / wedding",
    setupHours: 2,
    packDownHours: 1,
    tasks: [
      t("hard_setup", "Hard Setup / Heavy Setup", 2, ["start", -180], ["start", -90]),
      t("soft_setup", "Soft Setup / Table Setup", 2, ["start", -120], ["start", 0]),
      t("food_service", "Food Service / Waitstaff", 4, ["start", 0], ["end", 0]),
      t("barista", "Barista", 1, ["start", 0], ["end", 0]),
      t("bartender", "Bartender / Bar Service", 1, ["start", 0], ["end", 0]),
      t("supervisor", "Event Supervisor", 1, ["start", -120], ["end", 60]),
      t("pack_down", "Pack-down and Room Reset", 2, ["end", 0], ["end", 60]),
    ],
  },
  {
    id: "conference_day",
    name: "Conference day",
    setupHours: 1,
    packDownHours: 1,
    tasks: [
      t("av_setup", "AV and Conference Setup", 1, ["start", -60], ["start", 0]),
      t("soft_setup", "Soft Setup / Table Setup", 2, ["start", -60], ["start", 0]),
      t("conference_support", "Conference Support", 2, ["start", 0], ["end", 0]),
      t("barista", "Barista", 1, ["start", 0], ["end", 0]),
      t("food_service", "Food Service / Waitstaff", 2, ["start", 0], ["end", 0]),
      t("team_leader", "Team Leader", 1, ["start", -60], ["end", 60]),
      t("pack_down", "Pack-down and Room Reset", 2, ["end", 0], ["end", 60]),
    ],
  },
  {
    id: "cocktail_function",
    name: "Cocktail function",
    setupHours: 1,
    packDownHours: 1,
    tasks: [
      t("soft_setup", "Soft Setup / Table Setup", 1, ["start", -60], ["start", 0]),
      t("bartender", "Bartender / Bar Service", 2, ["start", 0], ["end", 0]),
      t("food_running", "Food Running", 3, ["start", 0], ["end", 0]),
      t("bar_stock", "Bar Stock and Replenishment", 1, ["start", -60], ["end", 0]),
      t("supervisor", "Event Supervisor", 1, ["start", -60], ["end", 60]),
      t("pack_down", "Pack-down and Room Reset", 2, ["end", 0], ["end", 60]),
    ],
  },
];

function resolve([anchor, offset]: RelativeTime, times: EventTimes): number {
  return (anchor === "start" ? times.start : times.end) + offset;
}

// The template's tasks for an event at `times`, copying each type's current
// requirements. Types that no longer exist become plain tasks with the same name.
export function tasksFromTemplate(template: EventTemplate, types: TaskType[], times: EventTimes): EventTask[] {
  const tasks: EventTask[] = [];
  for (const item of template.tasks) {
    const type = types.find((x) => x.id === item.typeId);
    let start = resolve(item.from, times);
    let end = resolve(item.to, times);
    if (end <= start) ({ start, end } = phaseWindow(type?.phase ?? "event", times));
    tasks.push({
      id: uniqueTaskId(tasks),
      typeId: type?.id ?? "",
      name: uniqueTaskName(item.name || type?.name || "Task", tasks),
      count: Math.max(item.count, type?.minTeam ?? 1),
      startTime: formatMinutes(start),
      endTime: formatMinutes(end),
      notes: item.notes,
      mandatory: true,
      controlsConfirmed: false,
      ...(type
        ? requirementsOf(type)
        : {
            skillId: "",
            minLevel: "",
            qualificationIds: [],
            demand: "low",
            minTeam: 1,
            controls: "",
            needsSupervisor: false,
            leadership: false,
            combinable: false,
          }),
    });
  }
  return tasks;
}

// Saves an event's tasks as a template: each time relative to whichever of
// the event's start or end it is nearer to.
export function templateFromTasks(
  name: string,
  tasks: { typeId: string; name: string; count: number; window: { start: number; end: number }; notes: string }[],
  times: EventTimes,
  id: string
): EventTemplate {
  const relative = (minutes: number): RelativeTime => {
    const middle = (times.start + times.end) / 2;
    return minutes <= middle ? ["start", minutes - times.start] : ["end", minutes - times.end];
  };
  return {
    id,
    name,
    setupHours: times.setupMinutes / 60,
    packDownHours: times.packDownMinutes / 60,
    tasks: tasks.map((task) => ({
      typeId: task.typeId,
      name: task.name,
      count: task.count,
      from: relative(task.window.start),
      to: relative(task.window.end),
      notes: task.notes,
    })),
  };
}

export function makeTemplateId(name: string, templates: EventTemplate[]): string {
  return makeId(name, templates.map((t) => t.id));
}

// --- Storage and request parsing -------------------------------------------------

export const TEMPLATES_HEADER = ["Order", "ID", "Name", "Setup Hours", "Pack-down Hours", "Tasks"];

function parseRelative(value: unknown): RelativeTime | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [anchor, offset] = value;
  if ((anchor !== "start" && anchor !== "end") || !Number.isInteger(offset) || Math.abs(offset) > 24 * 60) return null;
  return [anchor, offset];
}

function parseTemplateTasks(value: unknown): TemplateTask[] | string {
  if (!Array.isArray(value)) return "Invalid template tasks";
  const tasks: TemplateTask[] = [];
  for (const item of value) {
    const v = (item ?? {}) as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name.trim().slice(0, 80) : "";
    const count = Number(v.count);
    const from = parseRelative(v.from);
    const to = parseRelative(v.to);
    if (!name || !from || !to) return "Every template task needs a name and times";
    if (!Number.isInteger(count) || count < 0 || count > MAX_TASK_COUNT) return `${name}: invalid number of workers`;
    tasks.push({
      typeId: isSkillId(v.typeId) ? v.typeId : "",
      name,
      count,
      from,
      to,
      notes: typeof v.notes === "string" ? v.notes.trim().slice(0, 1000) : "",
    });
  }
  return tasks;
}

function hours(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 12 ? n : fallback;
}

export function parseTemplatesInput(input: unknown): EventTemplate[] | string {
  if (!Array.isArray(input)) return "Invalid templates";
  const templates: EventTemplate[] = [];
  for (const item of input) {
    const v = (item ?? {}) as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name.trim().slice(0, 80) : "";
    if (!name) return "Every template needs a name";
    if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) return `"${name}" is listed twice`;
    const tasks = parseTemplateTasks(v.tasks);
    if (typeof tasks === "string") return `${name}: ${tasks}`;
    const id = isSkillId(v.id) && !templates.some((t) => t.id === v.id) ? v.id : makeId(name, templates.map((t) => t.id));
    templates.push({ id, name, setupHours: hours(v.setupHours, 1), packDownHours: hours(v.packDownHours, 1), tasks });
  }
  return templates;
}

export function templatesToRows(templates: EventTemplate[]): string[][] {
  return [
    TEMPLATES_HEADER,
    ...templates.map((t, i) => [
      String(i + 1),
      t.id,
      t.name,
      String(t.setupHours),
      String(t.packDownHours),
      JSON.stringify(t.tasks),
    ]),
  ];
}

// Rows from the tab (header excluded); `null` tab content means the defaults.
// A row whose tasks can't be read is skipped.
export function parseTemplateRows(rows: string[][] | null): EventTemplate[] {
  if (rows === null) return DEFAULT_TEMPLATES;
  const items = rows
    .filter((r) => (r[2] ?? "").trim())
    .map((r) => {
      let tasks: unknown = null;
      try {
        tasks = JSON.parse(r[5] ?? "");
      } catch {
        // skipped below
      }
      return { id: (r[1] ?? "").trim(), name: r[2], setupHours: r[3], packDownHours: r[4], tasks };
    });
  const templates: EventTemplate[] = [];
  for (const item of items) {
    const parsed = parseTemplatesInput([...templates, item]);
    if (typeof parsed !== "string") templates.push(parsed[parsed.length - 1]);
  }
  return templates;
}

