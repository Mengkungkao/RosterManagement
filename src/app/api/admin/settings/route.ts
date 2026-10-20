import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parseSettingsInput } from "@/lib/settings";
import { updateSettings } from "@/lib/settings-sheet";

export const dynamic = "force-dynamic";

// Pay settings (fortnight start, public holidays, award rates and loadings).
export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const body = await readJson(req);
  try {
    const error = await updateSettings((current) => parseSettingsInput(body, current));
    return error ? badRequest(error) : NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save settings", err);
  }
}
