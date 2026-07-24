import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { createEvent, listEvents, EventInput } from "@/lib/events";

export const dynamic = "force-dynamic";

function parseInput(body: unknown): EventInput | null {
  if (typeof body !== "object" || body === null) return null;
  const { name, date, startTime, endTime, location, notes } =
    body as Record<string, unknown>;

  if (
    typeof name !== "string" ||
    typeof date !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string"
  ) {
    return null;
  }

  return {
    name: name.trim(),
    date: date.trim(),
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    location: typeof location === "string" ? location.trim() : "",
    notes: typeof notes === "string" ? notes.trim() : "",
  };
}

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

  const input = parseInput(body);
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
