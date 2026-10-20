import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { saveTemplates } from "@/lib/config-sheet";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parseTemplatesInput } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const templates = parseTemplatesInput((((await readJson(req)) ?? {}) as Record<string, unknown>).templates);
  if (typeof templates === "string") return badRequest(templates);
  try {
    await saveTemplates(templates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save templates", err);
  }
}
