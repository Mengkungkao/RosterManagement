import { DAYS, Day } from "./availability";
import { EventRecord } from "./events";
import { StaffAvailability } from "./sheets";

const HOURS_IN_DAY = 24;
const MINUTES_IN_DAY = 1440;

export interface GridEventChip {
  eventId: string;
  name: string;
  phaseLabel?: string;
}

export interface HourCell {
  hour: number;
  events: GridEventChip[];
  staff: string[];
}

export type WeeklyGrid = Record<Day, HourCell[]>;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Splits a (possibly overnight) [start,end) range into one or two same-day segments.
function toSegments(start: number, end: number): [number, number][] {
  return start <= end
    ? [[start, end]]
    : [
        [start, MINUTES_IN_DAY],
        [0, end],
      ];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const segA = toSegments(aStart, aEnd);
  const segB = toSegments(bStart, bEnd);
  return segA.some(([s1, e1]) => segB.some(([s2, e2]) => s1 < e2 && s2 < e1));
}

export function getMelbourneWeekday(dateStr: string): Day {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne",
    weekday: "long",
  }).format(date);
  return weekday as Day;
}

function emptyGrid(): WeeklyGrid {
  return DAYS.reduce((grid, day) => {
    grid[day] = Array.from({ length: HOURS_IN_DAY }, (_, hour) => ({
      hour,
      events: [],
      staff: [],
    }));
    return grid;
  }, {} as WeeklyGrid);
}

export function buildWeeklyGrid(
  events: EventRecord[],
  staff: StaffAvailability[]
): WeeklyGrid {
  const grid = emptyGrid();

  for (const event of events) {
    const weekday = getMelbourneWeekday(event.date);
    const startMin = toMinutes(event.startTime);
    const endMin = toMinutes(event.endTime);

    const phaseLabelByHour = new Map<number, string>();
    for (const phase of event.phases) {
      if (!phase.time) continue;
      const hour = Math.floor(toMinutes(phase.time) / 60);
      const existing = phaseLabelByHour.get(hour);
      phaseLabelByHour.set(hour, existing ? `${existing} · ${phase.label}` : phase.label);
    }

    for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
      if (!overlaps(startMin, endMin, hour * 60, hour * 60 + 60)) continue;
      grid[weekday][hour].events.push({
        eventId: event.id,
        name: event.name,
        phaseLabel: phaseLabelByHour.get(hour),
      });
    }
  }

  for (const person of staff) {
    for (const day of DAYS) {
      const dayAvailability = person.week[day];
      if (dayAvailability.status === "unavailable") continue;

      for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
        if (dayAvailability.status === "available_all_day") {
          grid[day][hour].staff.push(person.staffName);
          continue;
        }
        const staffStart = toMinutes(dayAvailability.startTime);
        const staffEnd = toMinutes(dayAvailability.endTime);
        if (overlaps(staffStart, staffEnd, hour * 60, hour * 60 + 60)) {
          grid[day][hour].staff.push(person.staffName);
        }
      }
    }
  }

  return grid;
}
