// Reading and writing the configuration tabs (Task Types, Skills, Templates)
// and loading everything a page needs in one Google Sheets request.

import { type EventRecord, countUnreadableRows, parseEventRows } from "./events";
import { type PaySettings, parseSettingsRows } from "./settings";
import { DEFAULT_SKILLS, type SkillDef, isSkillId, makeId, parseSkillDefsInput } from "./skills";
import { type StaffMember, parseStaffRows } from "./staff";
import { getStore, tabName, withLock } from "./store";
import { type TaskType, parseTaskTypeRows, taskTypesToRows } from "./tasks";
import { type EventTemplate, parseTemplateRows, templatesToRows } from "./templates";

export const SKILLS_HEADER = ["Order", "ID", "Name", "Kind", "Active"];

// Rows from the Skills tab (header excluded). Missing or empty means the built-in list.
export function parseSkillRows(rows: string[][] | null): SkillDef[] {
  if (!rows) return DEFAULT_SKILLS;
  const items = rows
    .filter((r) => (r[2] ?? "").trim())
    .map((r) => ({
      id: (r[1] ?? "").trim(),
      name: (r[2] ?? "").trim(),
      kind: /^qual/i.test((r[3] ?? "").trim()) ? "qualification" : "skill",
      active: !/^(no|n|false|0)$/i.test((r[4] ?? "").trim()),
    }));
  const defs: SkillDef[] = [];
  for (const item of items) {
    const id = isSkillId(item.id) && !defs.some((d) => d.id === item.id) ? item.id : makeId(item.name, defs.map((d) => d.id));
    const parsed = parseSkillDefsInput([...defs, { ...item, id }]);
    if (typeof parsed !== "string") defs.push(parsed[parsed.length - 1]);
  }
  return defs.length > 0 ? defs : DEFAULT_SKILLS;
}

export function skillsToRows(skills: SkillDef[]): string[][] {
  return [
    SKILLS_HEADER,
    ...skills.map((s, i) => [
      String(i + 1),
      s.id,
      s.name,
      s.kind === "qualification" ? "Qualification" : "Skill",
      s.active ? "Yes" : "No",
    ]),
  ];
}

export interface AppConfig {
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
}

export interface AppData extends AppConfig {
  events: EventRecord[];
  staff: StaffMember[];
  settings: PaySettings;
  unreadableEvents: number; // rows in the Events tab that couldn't be read
}

const body = (rows: string[][] | null) => (rows ? rows.slice(1) : null);

// Everything the admin pages use, in a single request to Google Sheets.
export async function loadAll(): Promise<AppData> {
  const [events, staff, settings, taskTypes, skills, templates] = await getStore().readMany([
    tabName("events"),
    tabName("staff"),
    tabName("settings"),
    tabName("taskTypes"),
    tabName("skills"),
    tabName("templates"),
  ]);
  return {
    events: parseEventRows(events ?? []),
    unreadableEvents: countUnreadableRows(events ?? []),
    staff: parseStaffRows(staff ?? []),
    settings: parseSettingsRows(body(settings) ?? []),
    taskTypes: parseTaskTypeRows(body(taskTypes) ?? []),
    skills: parseSkillRows(body(skills)),
    templates: parseTemplateRows(body(templates)),
  };
}

export async function loadConfig(): Promise<AppConfig> {
  const [taskTypes, skills, templates] = await getStore().readMany([
    tabName("taskTypes"),
    tabName("skills"),
    tabName("templates"),
  ]);
  return {
    taskTypes: parseTaskTypeRows(body(taskTypes) ?? []),
    skills: parseSkillRows(body(skills)),
    templates: parseTemplateRows(body(templates)),
  };
}

async function writeTab(kind: "taskTypes" | "skills" | "templates", rows: string[][]): Promise<void> {
  await withLock(tabName(kind), () => getStore().writeAll(tabName(kind), rows));
}

export const saveTaskTypes = (types: TaskType[]) => writeTab("taskTypes", taskTypesToRows(types));
export const saveSkills = (skills: SkillDef[]) => writeTab("skills", skillsToRows(skills));
export const saveTemplates = (templates: EventTemplate[]) => writeTab("templates", templatesToRows(templates));
