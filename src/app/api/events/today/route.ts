import { NextRequest, NextResponse } from "next/server";
import { addDays, melbourneToday } from "@/lib/dates";
import { listEvents } from "@/lib/events";
import { badRequest, readJson, serverError } from "@/lib/http";
import { eventsInRange, formatWindow, listShifts, sameName, workDay } from "@/lib/roster";
import { claimOrVerifyStaffPassword } from "@/lib/staff";

export const dynamic = "force-dynamic";

const SHIFT_DAYS_AHEAD = 14;

// A staff member's own upcoming shifts, plus today's and tomorrow's events.
export async function POST(req: NextRequest) {
  const { name, password } = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return badRequest("Name is required");
  if (typeof password !== "string" || password.length === 0) return badRequest("Password is required");

  try {
    const access = await claimOrVerifyStaffPassword(name, password);
    if (!access.ok) return badRequest(access.error || "Incorrect password", 401);

    const today = melbourneToday();
    const tomorrow = addDays(today, 1);
    const allEvents = await listEvents();

    const mine = listShifts(eventsInRange(allEvents, today, SHIFT_DAYS_AHEAD)).filter((s) =>
      sameName(s.staffName, name)
    );
    // One entry per working day: the hours and break are for the whole day at
    // work, so two functions at the same time aren't counted twice.
    const workDays = [...new Set(mine.map((s) => s.date))].sort().map((date) => {
      const day = workDay(mine, name, date);
      return {
        date,
        hours: day.hours,
        breaks: day.breaks.map(formatWindow),
        shifts: mine
          .filter((s) => s.date === date)
          .sort((a, b) => a.start - b.start)
          .map((s) => ({ eventId: s.eventId, eventName: s.eventName, location: s.location, time: formatWindow(s) })),
      };
    });

    const days = [
      { date: today, label: "Today", events: allEvents.filter((e) => e.date === today) },
      { date: tomorrow, label: "Tomorrow", events: allEvents.filter((e) => e.date === tomorrow) },
    ];

    return NextResponse.json({ ok: true, workDays, days });
  } catch (err) {
    return serverError("load today's events", err);
  }
}
