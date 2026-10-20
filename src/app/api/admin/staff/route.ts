import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { type AwardLevel, isAwardLevel } from "@/lib/award";
import { loadConfig } from "@/lib/config-sheet";
import { isEmploymentType } from "@/lib/employment";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parsePreferencesInput, parseRestrictionsInput } from "@/lib/profile";
import { parseSkillsInput } from "@/lib/skills";
import { MAX_NAME_LENGTH, MAX_NOTES_LENGTH, type StaffChanges, addStaff, updateStaff } from "@/lib/staff";

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
  if (/[·\n\r]/.test(name)) return badRequest("Names can't contain line breaks or “·”");
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

// Changes a staff member's profile: type, award level, employee ID, active,
// skills, restrictions, preferences, manager notes, a decision on a request,
// or a password reset.
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
  if (body.employeeId !== undefined) {
    if (typeof body.employeeId !== "string" || body.employeeId.trim().length > 40) return badRequest("Invalid employee ID");
    changes.employeeId = body.employeeId.trim();
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return badRequest("Invalid active setting");
    changes.active = body.active;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > MAX_NOTES_LENGTH) {
      return badRequest(`Notes must be text of at most ${MAX_NOTES_LENGTH} characters`);
    }
    changes.notes = body.notes.trim();
  }
  if (body.preferences !== undefined) {
    const prefs = parsePreferencesInput(body.preferences);
    if (typeof prefs === "string") return badRequest(prefs);
    changes.preferences = prefs;
  }
  if (body.restrictions !== undefined) {
    const restrictions = parseRestrictionsInput(body.restrictions);
    if (typeof restrictions === "string") return badRequest(restrictions);
    changes.restrictions = restrictions;
  }
  if (body.requestDecision !== undefined) {
    const { id, status } = (body.requestDecision ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !["approved", "declined", "resolved"].includes(status as string)) {
      return badRequest("Invalid decision");
    }
    changes.requestDecision = { id, status: status as "approved" | "declined" | "resolved" };
  }
  try {
    if (body.skills !== undefined) {
      const skills = parseSkillsInput(body.skills, (await loadConfig()).skills);
      if (typeof skills === "string") return badRequest(skills);
      changes.skills = skills;
    }
    const result = await updateStaff(body.name, changes);
    return result.ok ? NextResponse.json({ ok: true }) : badRequest(result.error!, result.error === "Staff member not found" ? 404 : 409);
  } catch (err) {
    return serverError("update staff", err);
  }
}
