import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { type AwardLevel, isAwardLevel } from "@/lib/award";
import { isEmploymentType } from "@/lib/employment";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { MAX_NAME_LENGTH, type StaffChanges, addStaff, updateStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";

// undefined = not sent, null = cleared, a level = new level, false = invalid
function parseLevel(value: unknown): AwardLevel | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return isAwardLevel(value) ? value : false;
}

// Adds a staff member (they set their own password the first time they log in).
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("Name is required");
  if (name.length > MAX_NAME_LENGTH) return badRequest("Name is too long");
  const type = body.employmentType ?? "casual";
  if (!isEmploymentType(type)) return badRequest("Unknown employment type");
  const level = parseLevel(body.awardLevel);
  if (level === false) return badRequest("Unknown award level");
  try {
    const result = await addStaff(name, type, level ?? null);
    return result.ok ? NextResponse.json({ ok: true }) : badRequest(result.error!, 409);
  } catch (err) {
    return serverError("add staff", err);
  }
}

// Changes a staff member's type or award level, or resets their password.
export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (typeof body.name !== "string" || !body.name.trim()) return badRequest("Name is required");
  const changes: StaffChanges = {};
  if (body.employmentType !== undefined) {
    if (!isEmploymentType(body.employmentType)) return badRequest("Unknown employment type");
    changes.employmentType = body.employmentType;
  }
  const level = parseLevel(body.awardLevel);
  if (level === false) return badRequest("Unknown award level");
  if (level !== undefined) changes.awardLevel = level;
  if (body.resetPassword === true) changes.resetPassword = true;
  try {
    const result = await updateStaff(body.name, changes);
    return result.ok ? NextResponse.json({ ok: true }) : badRequest(result.error!, 404);
  } catch (err) {
    return serverError("update staff", err);
  }
}
