import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { deleteEvent, parseEventInput, updateEvent } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return unauthorized();
  const input = parseEventInput(await readJson(req));
  if (typeof input === "string") return badRequest(input);
  const { id } = await params;
  try {
    return NextResponse.json({ event: await updateEvent(id, input) });
  } catch (err) {
    if (err instanceof Error && err.message === "Event not found") return badRequest(err.message, 404);
    return serverError("update event", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return unauthorized();
  const { id } = await params;
  try {
    await deleteEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("delete event", err);
  }
}
