import { NextRequest, NextResponse } from "next/server";
import { DAYS, DAY_STATUSES, TIME_PATTERN, type WeekAvailability, availabilityGiven, emptyWeek } from "@/lib/availability";
import { badRequest, readJson, serverError } from "@/lib/http";
import { clearFailures, lockedOutMinutes, recordFailure, tooManyAttemptsMessage } from "@/lib/rate-limit";
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
      // Whether they've ever saved their availability ("not set yet" otherwise).
      set: hasPassword ? undefined : existing ? availabilityGiven(existing.week, existing.updatedAt) : false,
    });
  } catch (err) {
    return serverError("load your availability", err);
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

  if (/[·\n\r]/.test(name)) return badRequest("Names can't contain line breaks or “·”");

  const week = validateWeek(weekInput);
  if (!week) return badRequest("Availability data is invalid — check that each day's From and To times differ");

  const key = `staff:${name.trim().toLowerCase()}`;
  const wait = lockedOutMinutes(key);
  if (wait > 0) return badRequest(tooManyAttemptsMessage(wait), 429);
  try {
    const result = await saveStaffAvailability(name, week, password);
    if (!result.ok) {
      if (result.error === "Incorrect password") recordFailure(key);
      return badRequest(result.error ?? "Incorrect password", 403);
    }
    clearFailures(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save your availability", err);
  }
}
