import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadAll } from "@/lib/config-sheet";
import { TIME_PATTERN } from "@/lib/dates";
import { updateAllEvents } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { type Proposal, applyProposals } from "@/lib/roster";

export const dynamic = "force-dynamic";

type Accepted = Pick<Proposal, "eventId" | "taskId" | "staffName" | "startTime" | "endTime">;

function parseProposals(body: unknown): Accepted[] | string {
  const list = (body as { proposals?: unknown } | null)?.proposals;
  if (!Array.isArray(list) || list.length === 0) return "Choose at least one person to add";
  if (list.length > 2000) return "Too many changes at once";
  const accepted: Accepted[] = [];
  for (const item of list) {
    const v = (item ?? {}) as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    const p = {
      eventId: str(v.eventId),
      taskId: str(v.taskId),
      staffName: str(v.staffName).trim(),
      startTime: str(v.startTime),
      endTime: str(v.endTime),
    };
    if (!p.eventId || !p.staffName) return "Invalid proposal";
    if ((p.startTime || p.endTime) && !(TIME_PATTERN.test(p.startTime) && TIME_PATTERN.test(p.endTime))) {
      return "Invalid proposal times";
    }
    accepted.push(p);
  }
  return accepted;
}

// Adds the accepted part of a draft. Each person is checked again against the
// roster as it is now, so a change made since the draft can't be overwritten.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const proposals = parseProposals(await readJson(req));
  if (typeof proposals === "string") return badRequest(proposals);
  try {
    const data = await loadAll();
    const { result } = await updateAllEvents((events) => {
      const out = applyProposals(events, proposals, data.staff, data.settings.fortnightStart, {
        skills: data.skills,
        matching: data.settings.matching,
      });
      return { events: out.events, result: { applied: out.applied, skipped: out.skipped } };
    });
    return NextResponse.json(result);
  } catch (err) {
    return serverError("save the roster", err);
  }
}
