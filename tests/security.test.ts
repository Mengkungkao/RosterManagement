import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_SESSION_SECONDS, getAdminSessionToken, isAdminSessionValid, isValidAdminPassword } from "@/lib/admin-auth";
import { hashPassword, isHashed, verifyPassword } from "@/lib/passwords";
import { clearFailures, lockedOutMinutes, recordFailure } from "@/lib/rate-limit";

const env = { ...process.env };
beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret";
  process.env.ADMIN_PASSWORD = "open-sesame";
  delete process.env.ADMIN_PASSWORD_HASH;
});
afterEach(() => {
  process.env = { ...env };
});

describe("password hashing", () => {
  it("stores a salted hash, never the password", async () => {
    const a = await hashPassword("pw-123");
    const b = await hashPassword("pw-123");
    expect(isHashed(a)).toBe(true);
    expect(a).not.toContain("pw-123");
    expect(a).not.toBe(b); // different salt each time
    expect(await verifyPassword("pw-123", a)).toBe(true);
    expect(await verifyPassword("pw-124", a)).toBe(false);
  });

  it("still accepts a plain-text password from an older row", async () => {
    expect(await verifyPassword("old", "old")).toBe(true);
    expect(await verifyPassword("old", "older")).toBe(false);
    expect(await verifyPassword("", "")).toBe(false);
  });

  it("rejects a damaged hash instead of throwing", async () => {
    expect(await verifyPassword("x", "scrypt$abc$$$")).toBe(false);
  });
});

describe("admin sessions", () => {
  it("accepts a fresh session and refuses it once expired", () => {
    const now = Date.UTC(2026, 9, 20);
    const token = getAdminSessionToken(now);
    expect(isAdminSessionValid(token, now + 1000)).toBe(true);
    expect(isAdminSessionValid(token, now + ADMIN_SESSION_SECONDS * 1000 + 1)).toBe(false);
  });

  it("refuses a forged or edited token", () => {
    const now = Date.now();
    const [expires, signature] = getAdminSessionToken(now).split(".");
    expect(isAdminSessionValid(`${Number(expires) + 10_000_000}.${signature}`, now)).toBe(false);
    expect(isAdminSessionValid("admin", now)).toBe(false);
    expect(isAdminSessionValid(undefined, now)).toBe(false);
  });

  it("signs everyone out when the admin password changes", () => {
    const token = getAdminSessionToken();
    process.env.ADMIN_PASSWORD = "new-password";
    expect(isAdminSessionValid(token)).toBe(false);
  });

  it("checks the admin password against ADMIN_PASSWORD_HASH when set", async () => {
    process.env.ADMIN_PASSWORD_HASH = await hashPassword("hashed-admin");
    expect(await isValidAdminPassword("hashed-admin")).toBe(true);
    expect(await isValidAdminPassword("open-sesame")).toBe(false);
  });
});

describe("rate limiting", () => {
  it("locks a name out after repeated wrong passwords, and lets it go after a success", () => {
    const now = 1_000_000;
    for (let i = 0; i < 8; i++) recordFailure("staff:test", now);
    expect(lockedOutMinutes("staff:test", now)).toBe(15);
    expect(lockedOutMinutes("staff:test", now + 15 * 60 * 1000)).toBe(0);
    for (let i = 0; i < 8; i++) recordFailure("staff:test", now);
    clearFailures("staff:test");
    expect(lockedOutMinutes("staff:test", now)).toBe(0);
  });
});
