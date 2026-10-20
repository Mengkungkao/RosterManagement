// Skills and qualifications: the reusable list (Settings → Skills) and each
// person's record against it (Staff page). Pure functions only.
//
// A skill is a capability for a kind of work ("Barista", "Hard setup"); a
// qualification is something held that can lapse ("RSA", "First aid"). Both
// are recorded once per person and reused by every event. Nothing on file
// means "not verified" — never assumed competent.

import { isValidDate } from "./dates";

export const SKILL_LEVELS = ["learning", "trained", "experienced", "qualified"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  learning: "Learning",
  trained: "Trained",
  experienced: "Experienced",
  qualified: "Qualified / authorised",
};

// Higher is more capable; 0 is "not verified".
export function levelRank(level: SkillLevel | "" | null | undefined): number {
  return level ? SKILL_LEVELS.indexOf(level) + 1 : 0;
}

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === "string" && (SKILL_LEVELS as readonly string[]).includes(value);
}

export type SkillKind = "skill" | "qualification";

export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  active: boolean;
}

// One person's record for one skill or qualification.
export interface StaffSkill {
  level: SkillLevel; // qualifications are always "qualified" (held)
  verifiedOn: string; // YYYY-MM-DD or ""
  verifiedBy: string; // the manager who checked it
  expiresOn: string; // expiry (qualifications) or review date (skills); "" = none
}

export type StaffSkills = Record<string, StaffSkill>; // by skill id

export const DEFAULT_SKILLS: SkillDef[] = [
  { id: "banquet_service", name: "Banquet / food service", kind: "skill", active: true },
  { id: "food_running", name: "Food running", kind: "skill", active: true },
  { id: "soft_setup", name: "Soft setup (tables, linen)", kind: "skill", active: true },
  { id: "hard_setup", name: "Hard setup (furniture, staging)", kind: "skill", active: true },
  { id: "av_setup", name: "AV and conference setup", kind: "skill", active: true },
  { id: "pack_down", name: "Pack-down and room reset", kind: "skill", active: true },
  { id: "cleaning", name: "Cleaning and closing", kind: "skill", active: true },
  { id: "barista", name: "Barista", kind: "skill", active: true },
  { id: "bartending", name: "Bartending", kind: "skill", active: true },
  { id: "buffet", name: "Buffet and food stations", kind: "skill", active: true },
  { id: "bar_stock", name: "Bar stock and replenishment", kind: "skill", active: true },
  { id: "beverage_prep", name: "Beverage preparation", kind: "skill", active: true },
  { id: "supervision", name: "Event supervision", kind: "skill", active: true },
  { id: "team_leading", name: "Team leading", kind: "skill", active: true },
  { id: "conference_support", name: "Conference support", kind: "skill", active: true },
  { id: "guest_assistance", name: "Guest assistance", kind: "skill", active: true },
  { id: "rsa", name: "RSA (Responsible Service of Alcohol)", kind: "qualification", active: true },
  { id: "food_safety", name: "Food handling / food safety", kind: "qualification", active: true },
  { id: "first_aid", name: "First aid", kind: "qualification", active: true },
  { id: "manual_handling", name: "Manual handling training", kind: "qualification", active: true },
];

export function skillName(skills: SkillDef[], id: string): string {
  return skills.find((s) => s.id === id)?.name ?? id;
}

export type SkillState =
  | { ok: true; level: SkillLevel }
  | { ok: false; reason: "missing" | "expired" | "too_low"; level: SkillLevel | null; expiresOn?: string };

// Whether `record` meets `minLevel` on `date`. A record past its expiry or
// review date doesn't count until a manager re-checks it.
export function skillState(record: StaffSkill | undefined, minLevel: SkillLevel, date: string): SkillState {
  if (!record) return { ok: false, reason: "missing", level: null };
  if (record.expiresOn && record.expiresOn < date) {
    return { ok: false, reason: "expired", level: record.level, expiresOn: record.expiresOn };
  }
  if (levelRank(record.level) < levelRank(minLevel)) return { ok: false, reason: "too_low", level: record.level };
  return { ok: true, level: record.level };
}

// A current record (not expired on `date`), or undefined.
export function currentSkill(record: StaffSkill | undefined, date: string): StaffSkill | undefined {
  return record && (!record.expiresOn || record.expiresOn >= date) ? record : undefined;
}

// --- Sheet cell and request parsing -------------------------------------------

const ID_PATTERN = /^[a-z0-9_]{1,40}$/;

export function isSkillId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

// "Barista coffee" → "barista_coffee"
export function makeId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "item";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
}

function cleanRecord(value: unknown): StaffSkill | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isSkillLevel(v.level)) return null;
  const date = (d: unknown) => (typeof d === "string" && isValidDate(d) ? d : "");
  return {
    level: v.level,
    verifiedOn: date(v.verifiedOn),
    verifiedBy: typeof v.verifiedBy === "string" ? v.verifiedBy.trim().slice(0, 60) : "",
    expiresOn: date(v.expiresOn),
  };
}

// The staff row's Skills cell (JSON). Returns null when the cell has text that
// can't be read, so the caller can keep it untouched and report it.
export function parseSkillsCell(cell: string): StaffSkills | null {
  if (!cell.trim()) return {};
  try {
    const data = JSON.parse(cell);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    const skills: StaffSkills = {};
    for (const [id, value] of Object.entries(data)) {
      const record = cleanRecord(value);
      if (isSkillId(id) && record) skills[id] = record;
    }
    return skills;
  } catch {
    return null;
  }
}

export function formatSkillsCell(skills: StaffSkills): string {
  const ids = Object.keys(skills).sort();
  if (ids.length === 0) return "";
  return JSON.stringify(Object.fromEntries(ids.map((id) => [id, skills[id]])));
}

// Validates a person's skills sent from the Staff page.
export function parseSkillsInput(input: unknown, known: SkillDef[]): StaffSkills | string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return "Invalid skills";
  const skills: StaffSkills = {};
  for (const [id, value] of Object.entries(input)) {
    const def = known.find((s) => s.id === id);
    if (!def) return `Unknown skill "${id}"`;
    if (value === null) continue;
    const record = cleanRecord(value);
    if (!record) return `${def.name}: choose a level`;
    const v = value as Record<string, unknown>;
    if (v.verifiedOn && !record.verifiedOn) return `${def.name}: the verified date isn't a date`;
    if (v.expiresOn && !record.expiresOn) return `${def.name}: the expiry date isn't a date`;
    skills[id] = def.kind === "qualification" ? { ...record, level: "qualified" } : record;
  }
  return skills;
}

// Validates the list from Settings → Skills. Removed skills stay on people's
// records (harmless) but disappear from the lists; disabling is preferred.
export function parseSkillDefsInput(input: unknown): SkillDef[] | string {
  if (!Array.isArray(input)) return "Invalid skills list";
  const defs: SkillDef[] = [];
  for (const item of input) {
    const v = (item ?? {}) as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name.trim() : "";
    if (!name) return "Every skill needs a name";
    if (name.length > 80) return `"${name.slice(0, 20)}…" is too long`;
    const id = isSkillId(v.id) ? v.id : makeId(name, defs.map((d) => d.id));
    if (defs.some((d) => d.id === id)) return `"${name}" is listed twice`;
    if (defs.some((d) => d.name.toLowerCase() === name.toLowerCase())) return `"${name}" is listed twice`;
    defs.push({ id, name, kind: v.kind === "qualification" ? "qualification" : "skill", active: v.active !== false });
  }
  return defs;
}
