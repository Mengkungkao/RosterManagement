import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { createEvent, listEvents, parseEventInput } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const events = await listEvents();
    return NextResponse.json({ events });
  } catch (err) {
    console.error("Failed to load events", err);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

  try {
    const event = await createEvent(input);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 400 }
    );
  }
}
