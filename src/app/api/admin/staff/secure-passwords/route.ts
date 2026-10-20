import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { serverError, unauthorized } from "@/lib/http";
import { secureAllPasswords } from "@/lib/staff";

export const dynamic = "force-dynamic";

// Replaces plain-text staff passwords left by older versions with hashes.
export async function POST() {
  if (!(await isAdminRequest())) return unauthorized();
  try {
    return NextResponse.json({ secured: await secureAllPasswords() });
  } catch (err) {
    return serverError("secure the passwords", err);
  }
}
