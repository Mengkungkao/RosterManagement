import { clearFailures, lockedOutMinutes, recordFailure, tooManyAttemptsMessage } from "./rate-limit";
import { claimOrVerifyStaffPassword, verifyStaffPassword } from "./staff";
import type { WeekAvailability } from "./availability";

// Staff log in with their name and password on every request (the page keeps
// them in memory, never in storage). Repeated wrong passwords for one name
// are slowed down.
export type StaffLogin =
  | { ok: true; week?: WeekAvailability }
  | { ok: false; status: number; error: string };

export async function staffLogin(name: string, password: string, claim: boolean): Promise<StaffLogin> {
  const key = `staff:${name.trim().toLowerCase()}`;
  const wait = lockedOutMinutes(key);
  if (wait > 0) return { ok: false, status: 429, error: tooManyAttemptsMessage(wait) };
  if (claim) {
    const result = await claimOrVerifyStaffPassword(name, password);
    if (result.ok) {
      clearFailures(key);
      return { ok: true };
    }
    if (result.error === "Incorrect password") recordFailure(key);
    return { ok: false, status: 401, error: result.error ?? "Incorrect password" };
  }
  const result = await verifyStaffPassword(name, password);
  if (result.ok) {
    clearFailures(key);
    return { ok: true, week: result.week };
  }
  recordFailure(key);
  return { ok: false, status: 401, error: "Incorrect password" };
}
