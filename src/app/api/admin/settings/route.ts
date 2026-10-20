import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parseSettingsInput } from "@/lib/settings";
import { saveSettings } from "@/lib/settings-sheet";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const settings = parseSettingsInput(await readJson(req));
  if (typeof settings === "string") return badRequest(settings);
  try {
    await saveSettings(settings);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save settings", err);
  }
}
