import { DAYS, type Day } from "./availability";
import type { EventRecord } from "./events";
import type { StaffAvailability } from "./sheets";
import { getDayShifts, getMelbourneWeekday, type StaffDayShift } from "./roster-grid";
import { formatMelbourneTimestamp } from "./google-client";

export interface RosterDay {
  day: Day;
  date: string; // YYYY-MM-DD — the earliest event date that falls on this weekday
  events: EventRecord[]; // that day's events, earliest first
  shifts: StaffDayShift[]; // every staff member who's available that day
}

export interface RosterResult {
  days: RosterDay[]; // only weekdays with at least one event, Monday..Sunday order
  staffNames: string[]; // everyone who has submitted availability, alphabetical
  generatedAt: string;
}

// No headcount to hit and nothing to compete for — every staff member who's
// available on a day that has at least one event goes on that day's roster,
// with their own submitted hours as their shift. Days with no events are left
// off entirely, since there's nothing to roster them against.
export function generateRoster(
  events: EventRecord[],
  staff: StaffAvailability[]
): RosterResult {
  const generatedAt = formatMelbourneTimestamp(new Date());

  const eventsByDay = new Map<Day, EventRecord[]>();
  const earliestDateByDay = new Map<Day, string>();
  for (const event of events) {
    const weekday = getMelbourneWeekday(event.date);
    if (!eventsByDay.has(weekday)) eventsByDay.set(weekday, []);
    eventsByDay.get(weekday)!.push(event);

    const existing = earliestDateByDay.get(weekday);
    if (!existing || event.date < existing) earliestDateByDay.set(weekday, event.date);
  }

  const days: RosterDay[] = DAYS.filter((day) => eventsByDay.has(day)).map((day) => {
    const dayEvents = [...eventsByDay.get(day)!].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );

    return {
      day,
      date: earliestDateByDay.get(day)!,
      events: dayEvents,
      shifts: getDayShifts(staff, day),
    };
  });

  return {
    days,
    staffNames: [...staff].map((s) => s.staffName).sort((a, b) => a.localeCompare(b)),
    generatedAt,
  };
}
