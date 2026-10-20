import { isValidDate } from "@/lib/dates";

export function fortnightFrom(body: unknown): string | null {
  const value = (body as { fortnightStart?: unknown } | null)?.fortnightStart;
  return typeof value === "string" && isValidDate(value) ? value : null;
}
