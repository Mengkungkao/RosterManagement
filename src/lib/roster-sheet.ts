import { addDays, formatHours, formatSheetDate, formatWeekdayDate, melbourneTimestamp } from "./dates";
import type { EventRecord } from "./events";
import { eventsInRange, formatWindow, listShifts, sameName, type RosterStaff } from "./roster";
import { totalWorkedMinutes } from "./work-time";
import { getStore, tabName, withLock } from "./store";
import { GENERAL_TASK_ID } from "./tasks";

function eventSummary(event: EventRecord): string {
  const lines = [`${event.name} ${event.startTime}-${event.endTime}`];
  if (event.tasks.length > 0) {
    lines.push(event.tasks.map((t) => `${t.name} ${t.count} (${t.startTime || event.startTime}-${t.endTime || event.endTime})`).join(", "));
  }
  if (event.location) lines.push(event.location);
  if (event.actions.length > 0) {
    lines.push(event.actions.map((a) => (a.time ? `${a.label} ${a.time}` : a.label)).join(", "));
  }
  if (event.notes) lines.push(event.notes);
  return lines.join("\n");
}

// The printable Roster tab for one fortnight: dates across, staff down, each
// cell the person's shift times, event, task and unpaid break, and their
// total worked hours at the end (breaks out, shared functions counted once).
// Draft events are left out until they're published.
export function buildRosterSheet(
  events: EventRecord[],
  staff: RosterStaff[],
  fortnightStart: string
): string[][] {
  const dates = Array.from({ length: 14 }, (_, i) => addDays(fortnightStart, i));
  const fortnightEvents = eventsInRange(events, fortnightStart, 14).filter((e) => e.status !== "draft");
  const shifts = listShifts(fortnightEvents);
  const width = dates.length + 2;
  const row = (first: string, cells: string[] = [], last = "") => {
    const r = [first, ...cells, last];
    return [...r, ...Array(width - r.length).fill("")];
  };

  const names = staff.filter((s) => s.active !== false).map((s) => s.staffName);
  for (const shift of shifts) {
    if (!names.some((n) => sameName(n, shift.staffName))) names.push(shift.staffName);
  }

  const staffRows = names.map((name) => {
    const own = shifts.filter((s) => sameName(s.staffName, name));
    const cells = dates.map((date) =>
      own
        .filter((s) => s.date === date)
        .map((s) => {
          const breaks = s.breaks.length > 0 ? ` (break ${s.breaks.map(formatWindow).join(", ")})` : "";
          const task = s.taskId === GENERAL_TASK_ID ? "" : ` (${s.taskName})`;
          return `${formatWindow(s)} ${s.eventName}${task}${breaks}`;
        })
        .join("\n")
    );
    const hours =
      dates.reduce(
        (sum, date) =>
          sum + totalWorkedMinutes(own.filter((s) => s.date === date).map((s) => [s.absStart, s.absEnd])),
        0
      ) / 60;
    return row(name, cells, hours > 0 ? formatHours(hours) : "");
  });

  return [
    row(`Staff Roster ${formatSheetDate(dates[0])} to ${formatSheetDate(dates[13])}`),
    row("Name", dates.map(formatWeekdayDate), "Hours"),
    row(
      "Events",
      dates.map((date) =>
        fortnightEvents
          .filter((e) => e.date === date)
          .map(eventSummary)
          .join("\n\n")
      )
    ),
    row("Closing Sets"),
    row("Mid-shift Sets"),
    row(""),
    ...staffRows,
    row(""),
    row(`Generated ${melbourneTimestamp()}`),
  ];
}

// Returns how many draft events were left out.
export async function exportRoster(
  events: EventRecord[],
  staff: RosterStaff[],
  fortnightStart: string
): Promise<number> {
  await withLock(tabName("roster"), () =>
    getStore().writeAll(tabName("roster"), buildRosterSheet(events, staff, fortnightStart))
  );
  return eventsInRange(events, fortnightStart, 14).filter((e) => e.status === "draft").length;
}
