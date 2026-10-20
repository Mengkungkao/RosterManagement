import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { saveTaskTypes } from "@/lib/config-sheet";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";
import { parseTaskTypesInput } from "@/lib/tasks";

export const dynamic = "force-dynamic";

// Replaces the task type list (order as sent). Events keep their own copy of
// a task's requirements, so changing a type doesn't change existing events.
export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const types = parseTaskTypesInput((((await readJson(req)) ?? {}) as Record<string, unknown>).taskTypes);
  if (typeof types === "string") return badRequest(types);
  if (types.length === 0) return badRequest("Keep at least one task type (disable the others instead)");
  try {
    await saveTaskTypes(types);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("save task types", err);
  }
}
