import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parseMatchingInput } from "@/lib/settings";
import { updateSettings } from "@/lib/settings-sheet";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const matching = parseMatchingInput(await readJson(req));
  if (typeof matching === "string") return badRequest(matching);
  try {
    await updateSettings((current) => ({ ...current, matching }));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save matching settings", err);
  }
}
