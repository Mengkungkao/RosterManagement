import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listEvents } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { exportRoster } from "@/lib/roster-sheet";
import { readAllStaff } from "@/lib/staff";
import { fortnightFrom } from "../fortnight";

export const dynamic = "force-dynamic";

// Writes the fortnight's printable roster (published events only) to the Roster tab.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const fortnightStart = fortnightFrom(await readJson(req));
  if (!fortnightStart) return badRequest("Missing fortnight");
  try {
    const [events, staff] = await Promise.all([listEvents(), readAllStaff()]);
    const drafts = await exportRoster(events, staff, fortnightStart);
    return NextResponse.json({ ok: true, drafts });
  } catch (err) {
    return serverError("export the roster", err);
  }
}
