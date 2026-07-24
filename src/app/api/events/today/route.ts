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

    const todayDate = getMelbourneDateString();
    const tomorrowDate = getMelbourneDateString(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );
    const allEvents = await listEvents();

    const days = [
      {
        date: todayDate,
        label: "Today",
        events: allEvents.filter((event) => event.date === todayDate),
      },
      {
        date: tomorrowDate,
        label: "Tomorrow",
        events: allEvents.filter((event) => event.date === tomorrowDate),
      },
    ];

    return NextResponse.json({ ok: true, days });
  } catch (err) {
    console.error("Failed to load today's events", err);
    return NextResponse.json(
      { error: "Failed to load today's events" },
      { status: 500 }
    );
  }
}
