import { fortnightStartFor, isValidDate, melbourneToday } from "@/lib/dates";

// The fortnight a page shows: the one containing ?fortnight=…, or the current one.
export function pickFortnight(param: string | string[] | undefined, anchor: string) {
  const today = melbourneToday();
  const currentFortnight = fortnightStartFor(today, anchor);
  const requested = typeof param === "string" && isValidDate(param) ? param : today;
  return { today, currentFortnight, fortnightStart: fortnightStartFor(requested, anchor) };
}
