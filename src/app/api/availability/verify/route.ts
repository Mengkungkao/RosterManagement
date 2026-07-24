import { NextRequest, NextResponse } from "next/server";
import { verifyStaffPassword } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, password } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  try {
    const result = await verifyStaffPassword(name, password);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Incorrect password" },
        { status: 401 }
      );
    }
    return NextResponse.json({
      ok: true,
      week: result.week,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    console.error("Failed to verify password", err);
    return NextResponse.json(
      { error: "Failed to verify password" },
      { status: 500 }
    );
  }
}
