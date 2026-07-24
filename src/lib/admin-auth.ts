import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "roster_admin_session";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function isValidAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD is not set");
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getAdminSessionToken(): string {
  return createHmac("sha256", getSecret()).update("admin-session").digest("hex");
}

export function isAdminSessionValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const expected = getAdminSessionToken();
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSessionValid(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}
