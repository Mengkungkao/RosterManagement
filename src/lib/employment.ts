// Employment types ("personas") and the hour rules the roster follows for each.

export const EMPLOYMENT_TYPES = ["casual", "part_time", "full_time", "student"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const STUDENT_MAX_FORTNIGHT_HOURS = 48; // hard limit — auto-fill never goes over
export const FULL_TIME_FORTNIGHT_HOURS = 76; // target and soft limit — avoided unless no one else can work
export const CASUAL_FORTNIGHT_HOURS = 76; // soft limit, like full-time
export const PART_TIME_MIN_WEEKLY_HOURS = 8; // minimum — part-timers below it are rostered first
export const DAILY_MAX_HOURS = 12; // everyone, after unpaid breaks

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  casual: "Casual",
  part_time: "Part-time",
  full_time: "Full-time",
  student: "Student",
};

export const EMPLOYMENT_RULES: Record<EmploymentType, string> = {
  casual: `Up to ${CASUAL_FORTNIGHT_HOURS}h per fortnight where possible`,
  part_time: `At least ${PART_TIME_MIN_WEEKLY_HOURS}h per week`,
  full_time: `Up to ${FULL_TIME_FORTNIGHT_HOURS}h per fortnight`,
  student: `No more than ${STUDENT_MAX_FORTNIGHT_HOURS}h per fortnight; paid as casual`,
};

// The fortnight hours auto-fill tries not to go past (it still will when no
// one else can work). Students have a hard limit instead.
export function softFortnightLimit(type: EmploymentType): number | null {
  if (type === "full_time") return FULL_TIME_FORTNIGHT_HOURS;
  if (type === "casual") return CASUAL_FORTNIGHT_HOURS;
  return null;
}

// Award pay basis: students are employed (and paid) as casuals.
export function isPaidAsCasual(type: EmploymentType): boolean {
  return type === "casual" || type === "student";
}

// Reads whatever is in the sheet's Type cell. Blank or unknown means casual,
// whose limit is only a preference, so an unset type never blocks anyone.
export function parseEmploymentType(cell: string): EmploymentType {
  const value = cell.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "parttime" || value === "pt") return "part_time";
  if (value === "fulltime" || value === "ft") return "full_time";
  if (value === "student" || value === "studentvisa") return "student";
  return "casual";
}

export function isEmploymentType(value: unknown): value is EmploymentType {
  return typeof value === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}
