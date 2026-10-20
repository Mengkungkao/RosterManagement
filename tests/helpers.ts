import { DAYS, type DayAvailability, type WeekAvailability } from "@/lib/availability";
import type { EmploymentType } from "@/lib/employment";
import type { EventRecord } from "@/lib/events";
import type { RosterStaff } from "@/lib/roster";
import type { RecordLevel, StaffSkill } from "@/lib/skills";
import type { EventTask } from "@/lib/tasks";

export const ALL_DAY: DayAvailability = { status: "available_all_day", startTime: "", endTime: "" };
export const OFF: DayAvailability = { status: "unavailable", startTime: "", endTime: "" };
export const hours = (startTime: string, endTime: string): DayAvailability => ({
  status: "custom",
  startTime,
  endTime,
});

export function week(days: Partial<WeekAvailability> = {}, fallback: DayAvailability = ALL_DAY): WeekAvailability {
  return Object.fromEntries(DAYS.map((d) => [d, days[d] ?? fallback])) as WeekAvailability;
}

export function person(
  staffName: string,
  employmentType: EmploymentType = "casual",
  availability: WeekAvailability = week()
): RosterStaff {
  return { staffName, employmentType, week: availability };
}

let nextId = 1;
export function event(fields: Partial<EventRecord> = {}): EventRecord {
  return {
    id: `e${nextId++}`,
    name: "Event",
    date: "2026-10-20", // a Tuesday, in the fortnight starting Monday 2026-10-12
    startTime: "17:00",
    endTime: "22:00",
    location: "",
    notes: "",
    actions: [],
    staffNeeded: 1,
    setupHours: 1,
    packDownHours: 1,
    shareStaff: false,
    tasks: [],
    status: "published",
    rev: 0,
    staff: [],
    ...fields,
  };
}

export const ANCHOR = "2026-01-05"; // a Monday; the fortnight around the test dates starts 2026-10-12
export const FORTNIGHT = "2026-10-12";

export function task(fields: Partial<EventTask> & { id: string; name: string }): EventTask {
  return {
    typeId: "",
    count: 1,
    startTime: "17:00",
    endTime: "22:00",
    notes: "",
    mandatory: true,
    controlsConfirmed: false,
    skillId: "",
    minLevel: "",
    qualificationIds: [],
    demand: "low",
    minTeam: 1,
    controls: "",
    needsSupervisor: false,
    leadership: false,
    combinable: false,
    ...fields,
  };
}

export const skill = (level: RecordLevel, expiresOn = ""): StaffSkill => ({
  level,
  verifiedOn: "2026-09-01",
  verifiedBy: "Manager",
  expiresOn,
});
