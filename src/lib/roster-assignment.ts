import { DAYS, type Day } from "./availability";
import type { EventRecord } from "./events";
import type { StaffAvailability } from "./sheets";
import { getAvailableStaff, getMelbourneWeekday, overlaps, toMinutes } from "./roster-grid";
import { formatMelbourneTimestamp } from "./google-client";

export interface AssignedStaff {
  staffName: string;
  coverage: "full" | "partial";
}

export interface RosterAssignment {
  eventId: string;
  assigned: AssignedStaff[];
  staffNeeded: number;
  shortfall: number;
  generatedAt: string;
}

// Auto-rosters every event: for each event (processed in chronological order),
// picks `staffNeeded` people from who's available, preferring full coverage
// over partial and — among equally-suited candidates — whoever has the fewest
// shifts assigned so far this run, so work spreads out across the week.
// A staff member is never double-booked onto two overlapping events on the
// same weekday (availability is a weekly-recurring pattern, so conflicts are
// checked per weekday rather than per exact calendar date).
export function generateRoster(
  events: EventRecord[],
  staff: StaffAvailability[]
): RosterAssignment[] {
  const generatedAt = formatMelbourneTimestamp(new Date());

  const sortedEvents = [...events].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    return dateCompare !== 0 ? dateCompare : a.startTime.localeCompare(b.startTime);
  });

  const shiftsAssigned = new Map<string, number>();
  const busyByDay = new Map<Day, Map<string, [number, number][]>>(
    DAYS.map((day) => [day, new Map<string, [number, number][]>()])
  );

  return sortedEvents.map((event) => {
    const weekday = getMelbourneWeekday(event.date);
    const start = toMinutes(event.startTime);
    const end = toMinutes(event.endTime);
    const dayBusy = busyByDay.get(weekday)!;

    const candidates = getAvailableStaff(staff, weekday, start, end).filter((candidate) => {
      const intervals = dayBusy.get(candidate.staffName) || [];
      return !intervals.some(([busyStart, busyEnd]) => overlaps(start, end, busyStart, busyEnd));
    });

    candidates.sort((a, b) => {
      if (a.coverage !== b.coverage) return a.coverage === "full" ? -1 : 1;
      const loadDiff =
        (shiftsAssigned.get(a.staffName) || 0) - (shiftsAssigned.get(b.staffName) || 0);
      return loadDiff !== 0 ? loadDiff : a.staffName.localeCompare(b.staffName);
    });

    const assigned = candidates.slice(0, event.staffNeeded);
    for (const person of assigned) {
      shiftsAssigned.set(person.staffName, (shiftsAssigned.get(person.staffName) || 0) + 1);
      const intervals = dayBusy.get(person.staffName) || [];
      intervals.push([start, end]);
      dayBusy.set(person.staffName, intervals);
    }

    return {
      eventId: event.id,
      assigned,
      staffNeeded: event.staffNeeded,
      shortfall: Math.max(0, event.staffNeeded - assigned.length),
      generatedAt,
    };
  });
}
