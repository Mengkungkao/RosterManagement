import { NextRequest, NextResponse } from "next/server";
import { badRequest, readJson, serverError } from "@/lib/http";
import { verifyStaffPassword } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name, password } = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return badRequest("Name is required");
  if (typeof password !== "string" || password.length === 0) return badRequest("Password is required");

  try {
    const result = await verifyStaffPassword(name, password);
    if (!result.ok) return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    return NextResponse.json({ ok: true, week: result.week });
  } catch (err) {
    return serverError("verify password", err);
  }
}
