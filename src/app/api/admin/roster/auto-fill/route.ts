import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { melbourneToday } from "@/lib/dates";
import { updateAllEvents } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { type AutoFillResult, autoFill } from "@/lib/roster";
import { readSettings } from "@/lib/settings-sheet";
import { readAllStaff } from "@/lib/staff";
import { fortnightFrom } from "../fortnight";

export const dynamic = "force-dynamic";

// Fills the open places on the fortnight's events (today onwards) and saves them.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const fortnightStart = fortnightFrom(await readJson(req));
  if (!fortnightStart) return badRequest("Missing fortnight");
  try {
    const [staff, settings] = await Promise.all([readAllStaff(), readSettings()]);
    const run: { result?: AutoFillResult } = {};
    await updateAllEvents((events) => {
      run.result = autoFill(events, staff, fortnightStart, settings.fortnightStart, melbourneToday());
      return run.result.events;
    });
    const { added, shortfalls } = run.result!;
    return NextResponse.json({ added, shortfalls });
  } catch (err) {
    return serverError("auto-fill the roster", err);
  }
}
