import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { parseRosterInput, setEventStaff } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Replaces who is rostered on one event.
export async function PUT(req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return unauthorized();
  const staff = parseRosterInput(await readJson(req));
  if (typeof staff === "string") return badRequest(staff);
  const { id } = await params;
  try {
    return NextResponse.json({ event: await setEventStaff(id, staff) });
  } catch (err) {
    if (err instanceof Error && err.message === "Event not found") return badRequest(err.message, 404);
    return serverError("save the roster", err);
  }
}
