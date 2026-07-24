export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Day = (typeof DAYS)[number];

export const DAY_STATUSES = ["unavailable", "available_all_day", "custom"] as const;

export type DayStatus = (typeof DAY_STATUSES)[number];

export interface DayAvailability {
  status: DayStatus;
  startTime: string;
  endTime: string;
}

export type WeekAvailability = Record<Day, DayAvailability>;

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function emptyDay(): DayAvailability {
  return { status: "unavailable", startTime: "", endTime: "" };
}

export function emptyWeek(): WeekAvailability {
  return DAYS.reduce((week, day) => {
    week[day] = emptyDay();
    return week;
  }, {} as WeekAvailability);
}

export function describeDay(day: DayAvailability): string {
  if (day.status === "available_all_day") return "Available all day";
  if (day.status === "custom") return `${day.startTime}–${day.endTime}`;
  return "Unavailable";
}
