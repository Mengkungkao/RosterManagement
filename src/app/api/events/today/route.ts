import { NextRequest, NextResponse } from "next/server";
import { claimOrVerifyStaffPassword } from "@/lib/sheets";
import { listEvents } from "@/lib/events";
import { getMelbourneDateString } from "@/lib/google-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  try {
    const access = await claimOrVerifyStaffPassword(name, password);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error || "Incorrect password" },
        { status: 401 }
      );
    }

    const date = getMelbourneDateString();
    const events = (await listEvents())
      .filter((event) => event.date === date)
      .map((event) => ({
        name: event.name,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        notes: event.notes,
        actions: event.actions,
      }));

    return NextResponse.json({ ok: true, date, events });
  } catch (err) {
    console.error("Failed to load today's events", err);
    return NextResponse.json(
      { error: "Failed to load today's events" },
      { status: 500 }
    );
  }
}
