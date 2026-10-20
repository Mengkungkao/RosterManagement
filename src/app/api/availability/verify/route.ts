import { NextRequest, NextResponse } from "next/server";
import { badRequest, readJson, serverError } from "@/lib/http";
import { readStaff } from "@/lib/staff";
import { staffLogin } from "@/lib/staff-auth";
import { ownRequests } from "../../requests/own";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name, password } = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return badRequest("Name is required");
  if (typeof password !== "string" || password.length === 0) return badRequest("Password is required");

  try {
    const login = await staffLogin(name, password, false);
    if (!login.ok) return NextResponse.json({ ok: false, error: login.error }, { status: login.status });
    const me = await readStaff(name);
    return NextResponse.json({ ok: true, week: login.week, requests: ownRequests(me) });
  } catch (err) {
    return serverError("verify the password", err);
  }
}
