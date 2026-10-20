import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { createEvent, listEvents, parseEventInput } from "@/lib/events";
import { badRequest, readJson, serverError, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) return unauthorized();
  try {
    return NextResponse.json({ events: await listEvents() });
  } catch (err) {
    return serverError("load events", err);
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return unauthorized();
  const input = parseEventInput(await readJson(req));
  if (typeof input === "string") return badRequest(input);
  try {
    return NextResponse.json({ event: await createEvent(input) });
  } catch (err) {
    return serverError("create event", err);
  }
}
