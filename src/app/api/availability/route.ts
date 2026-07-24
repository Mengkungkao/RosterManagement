import { NextRequest, NextResponse } from "next/server";
import {
  DAYS,
  DAY_STATUSES,
  Day,
  TIME_PATTERN,
  WeekAvailability,
  emptyWeek,
} from "@/lib/availability";
import { readStaffAvailability, saveStaffAvailability } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  try {
    const existing = await readStaffAvailability(name);
    return NextResponse.json({
      found: existing !== null,
      week: existing?.week ?? emptyWeek(),
      updatedAt: existing?.updatedAt ?? null,
    });
  } catch (err) {
    console.error("Failed to load availability", err);
    return NextResponse.json(
      { error: "Failed to load availability" },
      { status: 500 }
    );
  }
}

function validateWeek(input: unknown): WeekAvailability | null {
  if (typeof input !== "object" || input === null) return null;
  const record = input as Record<string, unknown>;
  const week = emptyWeek();

  for (const day of DAYS) {
    const value = record[day];
    if (typeof value !== "object" || value === null) return null;
    const { status, startTime, endTime } = value as Record<string, unknown>;

    if (typeof status !== "string" || !DAY_STATUSES.includes(status as never)) {
      return null;
    }

    if (status === "custom") {
      if (
        typeof startTime !== "string" ||
        typeof endTime !== "string" ||
        !TIME_PATTERN.test(startTime) ||
        !TIME_PATTERN.test(endTime)
      ) {
        return null;
      }
      week[day as Day] = { status: "custom", startTime, endTime };
    } else {
      week[day as Day] = {
        status: status as "available_all_day" | "unavailable",
        startTime: "",
        endTime: "",
      };
    }
  }

  return week;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, week: weekInput } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  const week = validateWeek(weekInput);
  if (!week) {
    return NextResponse.json(
      { error: "Availability data is invalid" },
      { status: 400 }
    );
  }

  try {
    await saveStaffAvailability(name, week);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save availability", err);
    return NextResponse.json(
      { error: "Failed to save availability" },
      { status: 500 }
    );
  }
}
