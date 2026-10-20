import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { addDays, melbourneToday } from "@/lib/dates";
import { updateAllEvents } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { fortnightFrom } from "../fortnight";

export const dynamic = "force-dynamic";

// Takes everyone off the fortnight's events from today on (the events stay).
// Past events keep their roster: it is the record their wages come from.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const fortnightStart = fortnightFrom(await readJson(req));
  if (!fortnightStart) return badRequest("Missing fortnight");
  const fortnightEnd = addDays(fortnightStart, 13);
  const from = [fortnightStart, melbourneToday()].sort()[1];
  try {
    let cleared = 0;
    await updateAllEvents((events) =>
      events.map((e) => {
        if (e.date < from || e.date > fortnightEnd || e.staff.length === 0) return e;
        cleared += e.staff.length;
        return { ...e, staff: [] };
      })
    );
    return NextResponse.json({ cleared });
  } catch (err) {
    return serverError("clear the roster", err);
  }
}
