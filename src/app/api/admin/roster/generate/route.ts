import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadAll } from "@/lib/config-sheet";
import { melbourneToday } from "@/lib/dates";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { generateRoster } from "@/lib/roster";
import { fortnightFrom } from "../fortnight";

export const dynamic = "force-dynamic";

// A draft roster for the fortnight (today onwards): who Generate would add to
// each open place and why, and what it couldn't fill. Nothing is saved.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const fortnightStart = fortnightFrom(await readJson(req));
  if (!fortnightStart) return badRequest("Missing fortnight");
  try {
    const data = await loadAll();
    const { proposals, gaps } = generateRoster(
      data.events,
      data.staff,
      fortnightStart,
      data.settings.fortnightStart,
      melbourneToday(),
      { skills: data.skills, matching: data.settings.matching }
    );
    return NextResponse.json({ proposals, gaps });
  } catch (err) {
    return serverError("generate the roster", err);
  }
}
