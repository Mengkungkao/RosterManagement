import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { saveSkills } from "@/lib/config-sheet";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parseSkillDefsInput } from "@/lib/skills";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const skills = parseSkillDefsInput((((await readJson(req)) ?? {}) as Record<string, unknown>).skills);
  if (typeof skills === "string") return badRequest(skills);
  if (skills.length === 0) return badRequest("Keep at least one skill (disable the others instead)");
  try {
    await saveSkills(skills);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save skills", err);
  }
}
