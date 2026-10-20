import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadAll } from "@/lib/config-sheet";
import { ValidationError, eventErrorStatus, modifyEvent, parseRosterInput } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { buildContext, checkRosterChange, listShifts } from "@/lib/roster";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Replaces who is on the event's tasks. Each person added or moved is checked
// against the rules on the server: safety, legal and authorisation checks
// can't be overridden; other warnings need a reason.
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return unauthorized();
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const staff = parseRosterInput(body);
  if (typeof staff === "string") return badRequest(staff);
  const rev = Number.isInteger(body.rev) ? (body.rev as number) : undefined;
  const { id } = await params;
  try {
    const data = await loadAll();
    const event = await modifyEvent(id, rev, (current, all) => {
      const next = { ...current, staff };
      const events = all.map((e) => (e.id === id ? next : e));
      const ctx = buildContext(data.staff, listShifts(events), data.settings.fortnightStart, {
        skills: data.skills,
        matching: data.settings.matching,
      });
      const problem = checkRosterChange(next, current.staff, ctx);
      if (problem) throw new ValidationError(problem);
      return next;
    });
    return NextResponse.json({ event });
  } catch (err) {
    const status = eventErrorStatus(err);
    if (status) return badRequest((err as Error).message, status);
    return serverError("save the roster", err);
  }
}
