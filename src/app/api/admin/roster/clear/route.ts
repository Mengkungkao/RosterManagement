import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { addDays, melbourneToday } from "@/lib/dates";
import { updateAllEvents } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { clearUnlocked } from "@/lib/roster";
import { fortnightFrom } from "../fortnight";

export const dynamic = "force-dynamic";

// Takes everyone who isn't locked off the fortnight's events from today on
// (the events stay). Past events keep their roster: it is the record their
// wages come from.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const fortnightStart = fortnightFrom(await readJson(req));
  if (!fortnightStart) return badRequest("Missing fortnight");
  const from = [fortnightStart, melbourneToday()].sort()[1];
  try {
    const { result } = await updateAllEvents((events) => {
      const out = clearUnlocked(events, from, addDays(fortnightStart, 13));
      return { events: out.events, result: { cleared: out.cleared, kept: out.kept } };
    });
    return NextResponse.json(result);
  } catch (err) {
    return serverError("clear the roster", err);
  }
}
