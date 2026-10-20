import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_SECONDS,
  getAdminSessionToken,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import { badRequest, readJson, serverError } from "@/lib/http";
import { clearFailures, lockedOutMinutes, recordFailure, tooManyAttemptsMessage } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const LIMIT_KEY = "admin";

export async function POST(req: NextRequest) {
  const { password } = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  if (typeof password !== "string" || password.length === 0) return badRequest("Password is required");

  const wait = lockedOutMinutes(LIMIT_KEY);
  if (wait > 0) return badRequest(tooManyAttemptsMessage(wait), 429);

  try {
    if (!(await isValidAdminPassword(password))) {
      recordFailure(LIMIT_KEY);
      return badRequest("Incorrect password", 401);
    }
  } catch (err) {
    return serverError("check the admin password", err);
  }
  clearFailures(LIMIT_KEY);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, getAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });

  return NextResponse.json({ ok: true });
}
