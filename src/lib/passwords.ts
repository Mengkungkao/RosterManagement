import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";

// Staff (and optionally admin) passwords are stored as salted scrypt hashes:
//   scrypt$<N>$<r>$<p>$<salt, base64>$<hash, base64>
// Older rows hold the password itself; those still work and are replaced by
// a hash the next time the person logs in (or when an admin secures them all
// from the Staff page). Node's built-in crypto only — no extra dependency.

const PREFIX = "scrypt";
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}

export function isHashed(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return [PREFIX, N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// Checks `password` against a stored hash, or against an old plain-text value.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!isHashed(stored)) return equal(Buffer.from(password), Buffer.from(stored));
  const [, n, r, p, salt, key] = stored.split("$");
  const params = [Number(n), Number(r), Number(p)];
  if (!salt || !key || params.some((x) => !Number.isInteger(x) || x <= 0)) return false;
  try {
    const actual = await scrypt(password, Buffer.from(salt, "base64"), params[0], params[1], params[2]);
    return equal(actual, Buffer.from(key, "base64"));
  } catch {
    return false;
  }
}
