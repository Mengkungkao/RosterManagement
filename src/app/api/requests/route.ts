import { NextRequest, NextResponse } from "next/server";
import { addDays, melbourneToday } from "@/lib/dates";
import { listEvents } from "@/lib/events";
import { badRequest, readJson, serverError } from "@/lib/http";
import { parseRequestInput } from "@/lib/profile";
import { sameName } from "@/lib/roster";
import { addStaffRequest, readStaff, withdrawStaffRequest } from "@/lib/staff";
import { staffLogin } from "@/lib/staff-auth";
import { ownRequests } from "./own";

export const dynamic = "force-dynamic";

function credentials(body: Record<string, unknown>): { name: string; password: string } | string {
  const { name, password } = body;
  if (typeof name !== "string" || !name.trim()) return "Name is required";
  if (typeof password !== "string" || !password) return "Password is required";
  return { name: name.trim(), password };
}

// A staff member asks for time off, or for a change to one of their shifts.
export async function POST(req: NextRequest) {
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const who = credentials(body);
  if (typeof who === "string") return badRequest(who);
  const today = melbourneToday();
  const request = parseRequestInput(body, today);
  if (typeof request === "string") return badRequest(request);
  try {
    const login = await staffLogin(who.name, who.password, true);
    if (!login.ok) return badRequest(login.error, login.status);
    let eventName = "";
    let { from, to } = request;
    if (request.kind === "change") {
      // Only for a published shift of theirs that hasn't happened yet.
      const event = (await listEvents()).find((e) => e.id === request.eventId);
      if (!event || event.status === "draft" || event.date < addDays(today, -1) || !event.staff.some((s) => sameName(s.name, who.name))) {
        return badRequest("That shift isn't one of yours");
      }
      eventName = event.name;
      from = to = event.date;
    }
    const result = await addStaffRequest(who.name, { ...request, from, to, eventName });
    if (!result.ok) return badRequest(result.error!, 409);
    return NextResponse.json({ ok: true, requests: ownRequests(await readStaff(who.name)) });
  } catch (err) {
    return serverError("send the request", err);
  }
}

// Withdraws a request that hasn't been answered yet.
export async function DELETE(req: NextRequest) {
  const body = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const who = credentials(body);
  if (typeof who === "string") return badRequest(who);
  if (typeof body.id !== "string") return badRequest("Missing request");
  try {
    const login = await staffLogin(who.name, who.password, false);
    if (!login.ok) return badRequest(login.error, login.status);
    const result = await withdrawStaffRequest(who.name, body.id);
    if (!result.ok) return badRequest(result.error!, 409);
    return NextResponse.json({ ok: true, requests: ownRequests(await readStaff(who.name)) });
  } catch (err) {
    return serverError("withdraw the request", err);
  }
}
