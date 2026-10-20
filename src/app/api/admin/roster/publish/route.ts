import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { addDays } from "@/lib/dates";
import { updateAllEvents } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { fortnightFrom } from "../fortnight";

export const dynamic = "force-dynamic";

// Publishes the fortnight's draft events, so staff see their shifts on them.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const fortnightStart = fortnightFrom(await readJson(req));
  if (!fortnightStart) return badRequest("Missing fortnight");
  const end = addDays(fortnightStart, 13);
  try {
    const { result } = await updateAllEvents((events) => {
      let published = 0;
      const next = events.map((e) => {
        if (e.status !== "draft" || e.date < fortnightStart || e.date > end) return e;
        published++;
        return { ...e, status: "published" as const };
      });
      return { events: next, result: { published } };
    });
    return NextResponse.json(result);
  } catch (err) {
    return serverError("publish the roster", err);
  }
}
