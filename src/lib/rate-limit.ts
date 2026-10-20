// Slows down password guessing: after too many failed attempts for one key
// (a staff name, or "admin") further attempts are refused for a while. Kept
// in this server process's memory — enough for one server; resets on restart.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

// Minutes until `key` may try again, or 0 if it may now.
export function lockedOutMinutes(key: string, now = Date.now()): number {
  const list = recent(key, now);
  if (list.length < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((list[0] + WINDOW_MS - now) / 60000));
}

export function recordFailure(key: string, now = Date.now()): void {
  failures.set(key, [...recent(key, now), now]);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

export function tooManyAttemptsMessage(minutes: number): string {
  return `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
