import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { deleteEvent, eventErrorStatus, parseEventInput, updateEvent } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Updates the event's details and tasks. `rev` (the version the page loaded)
// catches someone else having changed it meanwhile; `moveTasks` moves the
// task times with a new start time instead of leaving them as they are.
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return unauthorized();
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const input = parseEventInput(body);
  if (typeof input === "string") return badRequest(input);
  const rev = Number.isInteger(body.rev) ? (body.rev as number) : undefined;
  const { id } = await params;
  try {
    return NextResponse.json({ event: await updateEvent(id, input, { rev, moveTasks: body.moveTasks === true }) });
  } catch (err) {
    const status = eventErrorStatus(err);
    if (status) return badRequest((err as Error).message, status);
    return serverError("update the event", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return unauthorized();
  const { id } = await params;
  try {
    await deleteEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("delete the event", err);
  }
}
