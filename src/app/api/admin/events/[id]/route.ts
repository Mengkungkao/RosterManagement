import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { deleteEvent, updateEvent, parseEventInput } from "@/lib/events";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseEventInput(body);
  if (!input) {
    return NextResponse.json({ error: "Invalid event data" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const event = await updateEvent(id, input);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event" },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event" },
      { status: 400 }
    );
  }
}
