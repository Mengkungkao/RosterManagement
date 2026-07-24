import { Day } from "./availability";
import { EventRecord } from "./events";
import { StaffAvailability } from "./sheets";

export interface MatchedStaff {
  staffName: string;
  coverage: "full" | "partial";
}

export interface EventMatch {
  event: EventRecord;
  weekday: Day;
  available: MatchedStaff[];
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Splits a (possibly overnight) [start,end) range into one or two same-day segments.
function toSegments(start: number, end: number): [number, number][] {
  return start <= end
    ? [[start, end]]
    : [
        [start, 1440],
        [0, end],
      ];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const segA = toSegments(aStart, aEnd);
  const segB = toSegments(bStart, bEnd);
  return segA.some(([s1, e1]) => segB.some(([s2, e2]) => s1 < e2 && s2 < e1));
}

function contains(
  outerStart: number,
  outerEnd: number,
  innerStart: number,
  innerEnd: number
) {
  const outerSegs = toSegments(outerStart, outerEnd);
  const innerSegs = toSegments(innerStart, innerEnd);
  return innerSegs.every(([is, ie]) =>
    outerSegs.some(([os, oe]) => os <= is && ie <= oe)
  );
}

export function getMelbourneWeekday(dateStr: string): Day {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne",
    weekday: "long",
  }).format(date);
  return weekday as Day;
}

export function matchEventsWithAvailability(
  events: EventRecord[],
  staff: StaffAvailability[]
): EventMatch[] {
  return events.map((event) => {
    const weekday = getMelbourneWeekday(event.date);
    const eventStart = toMinutes(event.startTime);
    const eventEnd = toMinutes(event.endTime);

    const available: MatchedStaff[] = [];
    for (const person of staff) {
      const day = person.week[weekday];
      if (day.status === "unavailable") continue;

      if (day.status === "available_all_day") {
        available.push({ staffName: person.staffName, coverage: "full" });
        continue;
      }

      const staffStart = toMinutes(day.startTime);
      const staffEnd = toMinutes(day.endTime);
      if (!overlaps(eventStart, eventEnd, staffStart, staffEnd)) continue;

      available.push({
        staffName: person.staffName,
        coverage: contains(staffStart, staffEnd, eventStart, eventEnd)
          ? "full"
          : "partial",
      });
    }

    available.sort((a, b) => a.staffName.localeCompare(b.staffName));
    return { event, weekday, available };
  });
}
