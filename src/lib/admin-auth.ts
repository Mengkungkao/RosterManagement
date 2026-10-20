import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "./passwords";

export const ADMIN_COOKIE_NAME = "roster_admin_session";
export const ADMIN_SESSION_SECONDS = 60 * 60 * 24 * 7;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

// ADMIN_PASSWORD_HASH (from `npm run hash-password`) is preferred; a plain
// ADMIN_PASSWORD still works.
function storedAdminPassword(): string {
  const stored = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;
  if (!stored) throw new Error("ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is not set");
  return stored;
}

export async function isValidAdminPassword(password: string): Promise<boolean> {
  return verifyPassword(password, storedAdminPassword());
}

function sign(expires: number): string {
  // Tied to the current admin password: changing it signs everyone out.
  const fingerprint = createHash("sha256").update(storedAdminPassword()).digest("hex");
  return createHmac("sha256", getSecret()).update(`admin-session|${expires}|${fingerprint}`).digest("hex");
}

// "<expiry, ms>.<signature>" — checked on the server on every request.
export function getAdminSessionToken(now = Date.now()): string {
  const expires = now + ADMIN_SESSION_SECONDS * 1000;
  return `${expires}.${sign(expires)}`;
}

export function isAdminSessionValid(cookieValue: string | undefined, now = Date.now()): boolean {
  if (!cookieValue) return false;
  const [expiresText, signature] = cookieValue.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires < now || !signature) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(expires));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSessionValid(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

// For admin pages: sends anyone without a valid session to the sign-in page.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminRequest())) redirect("/admin/login");
}
