import { NextRequest, NextResponse } from "next/server";
import { addDays, melbourneToday } from "@/lib/dates";
import { type EventRecord, listEvents } from "@/lib/events";
import { badRequest, readJson, serverError } from "@/lib/http";
import { eventTasks, eventsInRange, formatWindow, listShifts, sameName, workDay } from "@/lib/roster";
import { readStaff } from "@/lib/staff";
import { staffLogin } from "@/lib/staff-auth";
import { GENERAL_TASK_ID } from "@/lib/tasks";
import { ownRequests } from "../../requests/own";

export const dynamic = "force-dynamic";

const SHIFT_DAYS_AHEAD = 14;

// What any staff member may see of an event: no one else's shifts, no
// requirements or manager notes about people.
function publicEvent(e: EventRecord) {
  return {
    id: e.id,
    name: e.name,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    location: e.location,
    notes: e.notes,
    actions: e.actions,
  };
}

// A staff member's own upcoming shifts (published events only), with their
// tasks and instructions, plus today's and tomorrow's events.
export async function POST(req: NextRequest) {
  const { name, password } = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return badRequest("Name is required");
  if (typeof password !== "string" || password.length === 0) return badRequest("Password is required");

  try {
    const access = await staffLogin(name, password, true);
    if (!access.ok) return badRequest(access.error, access.status);

    const today = melbourneToday();
    const tomorrow = addDays(today, 1);
    const allEvents = (await listEvents()).filter((e) => e.status !== "draft");
    const upcoming = eventsInRange(allEvents, addDays(today, -1), SHIFT_DAYS_AHEAD + 1);

    const mine = listShifts(upcoming).filter((s) => sameName(s.staffName, name));
    const shown = mine.filter((s) => s.date >= today || (s.date === addDays(today, -1) && s.end > 24 * 60));
    // One entry per working day: the hours and break are for the whole day at
    // work, so tasks or functions at the same time aren't counted twice.
    const workDays = [...new Set(shown.map((s) => s.date))].sort().map((date) => {
      const day = workDay(mine, name, date);
      return {
        date,
        hours: day.hours,
        breaks: day.breaks.map(formatWindow),
        shifts: shown
          .filter((s) => s.date === date)
          .sort((a, b) => a.start - b.start)
          .map((s) => {
            const event = upcoming.find((e) => e.id === s.eventId)!;
            const task = eventTasks(event).find((t) => t.id === s.taskId);
            return {
              eventId: s.eventId,
              eventName: s.eventName,
              location: s.location,
              time: formatWindow(s),
              taskName: s.taskId === GENERAL_TASK_ID && !event.tasks.length ? "" : s.taskName,
              taskNotes: task?.notes ?? "",
              eventTime: `${event.startTime}–${event.endTime}`,
              eventNotes: event.notes,
              actions: event.actions,
            };
          }),
      };
    });

    const days = [
      { date: today, label: "Today", events: allEvents.filter((e) => e.date === today).map(publicEvent) },
      { date: tomorrow, label: "Tomorrow", events: allEvents.filter((e) => e.date === tomorrow).map(publicEvent) },
    ];

    return NextResponse.json({ ok: true, workDays, days, requests: ownRequests(await readStaff(name)) });
  } catch (err) {
    return serverError("load your shifts", err);
  }
}
