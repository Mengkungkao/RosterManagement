import { NextRequest, NextResponse } from "next/server";
import { DAYS, DAY_STATUSES, TIME_PATTERN, type WeekAvailability, emptyWeek } from "@/lib/availability";
import { badRequest, readJson, serverError } from "@/lib/http";
import { MAX_NAME_LENGTH, readStaff, saveStaffAvailability } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return badRequest("Missing name");
  try {
    const existing = await readStaff(name);
    const hasPassword = existing?.hasPassword ?? false;
    return NextResponse.json({
      found: existing !== null,
      hasPassword,
      // Saved availability is only shown for entries without a password;
      // protected ones go through /api/availability/verify first.
      week: hasPassword ? emptyWeek() : (existing?.week ?? emptyWeek()),
    });
  } catch (err) {
    return serverError("load availability", err);
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
    if (typeof status !== "string" || !(DAY_STATUSES as readonly string[]).includes(status)) return null;

    if (status === "custom") {
      if (
        typeof startTime !== "string" ||
        typeof endTime !== "string" ||
        !TIME_PATTERN.test(startTime) ||
        !TIME_PATTERN.test(endTime) ||
        startTime === endTime
      ) {
        return null;
      }
      week[day] = { status: "custom", startTime, endTime };
    } else {
      week[day] = { status: status as "available_all_day" | "unavailable", startTime: "", endTime: "" };
    }
  }
  return week;
}

export async function POST(req: NextRequest) {
  const { name, week: weekInput, password } = ((await readJson(req)) ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length === 0) return badRequest("Name is required");
  if (name.trim().length > MAX_NAME_LENGTH) return badRequest("Name is too long");
  if (typeof password !== "string" || password.length === 0) return badRequest("Password is required");

  const week = validateWeek(weekInput);
  if (!week) return badRequest("Availability data is invalid — check that each day's From and To times differ");

  try {
    const result = await saveStaffAvailability(name, week, password);
    if (!result.ok) return badRequest(result.error ?? "Incorrect password", 403);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save availability", err);
  }
}
