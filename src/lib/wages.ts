// Minimum award pay for one pay fortnight, worked out minute by minute the way
// the Fair Work pay calculator does for the Hospitality Award (see award.ts):
// ordinary/weekend/public holiday rates, the Monday–Friday evening and night
// loadings, overtime past the daily and fortnightly limits, and minimum paid
// hours. Unpaid 30-minute breaks are taken out first (work-time.ts).
// Pure functions only.

import {
  type AwardLevel,
  CASUAL_MIN_ENGAGEMENT_MINUTES,
  DAILY_ORDINARY_MINUTES,
  FORTNIGHT_ORDINARY_MINUTES,
  OVERTIME_PERCENT,
  PENALTY_PERCENT,
  PUBLIC_HOLIDAY_MIN_MINUTES,
  percentOf,
} from "./award";
import { MINUTES_IN_DAY, addDays, formatMinutes, weekdayOf } from "./dates";
import { type EmploymentType, isPaidAsCasual } from "./employment";
import { sameName, type Shift } from "./roster";
import type { PaySettings } from "./settings";
import { type Interval, workBlocks, workedIntervals } from "./work-time";

export interface WageStaff {
  staffName: string;
  employmentType: EmploymentType;
  awardLevel: AwardLevel | null;
}

export interface PayItem {
  label: string;
  hours: number; // for a loading: the number of hours (or parts) it is paid for
  rate: number; // $ per hour
  amount: number;
}

export interface DayPay {
  date: string; // the shift's date
  times: string; // "16:30–00:30"
  breaks: string[]; // ["20:30–21:00"]
  hours: number;
  amount: number | null;
}

export interface WageLine {
  staffName: string;
  employmentType: EmploymentType;
  casual: boolean;
  awardLevel: AwardLevel | null;
  baseRate: number | null; // full-time/part-time hourly rate for their level
  workedHours: number;
  items: PayItem[];
  days: DayPay[];
  pay: number | null; // null when no award level is set
  byEvent: Record<string, { hours: number; pay: number }>; // this person's time and pay per event
}

export interface WageSummary {
  lines: WageLine[];
  totalHours: number;
  totalPay: number; // of everyone with an award level
  missingLevels: string[]; // rostered staff with no award level
  // Each event's share of the hours and pay. Someone on two functions at once
  // has that time split between them, so the events add up to the total.
  byEvent: Record<string, { hours: number; pay: number; missingLevels: string[] }>;
}

const cents = (value: number) => Math.round(value * 100) / 100;
// minutes × hourly rate, in whole cents rounded half up (30 min at $33.85 is $16.93).
const amountFor = (minutes: number, rate: number) => Math.round((minutes * Math.round(rate * 100)) / 60) / 100;

function dateOfMinute(absMinute: number): string {
  return addDays("1970-01-01", Math.floor(absMinute / MINUTES_IN_DAY));
}

type DayKind = "weekday" | "saturday" | "sunday" | "publicHoliday";

function dayKind(date: string, settings: PaySettings): DayKind {
  if (settings.publicHolidays.includes(date)) return "publicHoliday";
  const weekday = weekdayOf(date);
  if (weekday === "Saturday") return "saturday";
  if (weekday === "Sunday") return "sunday";
  return "weekday";
}

const KIND_LABEL: Record<DayKind, string> = {
  weekday: "Mon–Fri",
  saturday: "Saturday",
  sunday: "Sunday",
  publicHoliday: "Public holiday",
};

// Pay for one person's shifts (already limited to the fortnight).
function payFor(
  person: WageStaff,
  shifts: Shift[],
  settings: PaySettings
): Omit<WageLine, "staffName" | "employmentType" | "awardLevel"> {
  // Which events a minute of work belongs to (split evenly when on several at once).
  const byEvent = new Map<string, { minutes: number; amount: number }>();
  const eventsAt = (minute: number) => [
    ...new Set(shifts.filter((s) => s.absStart <= minute && minute < s.absEnd).map((s) => s.eventId)),
  ];
  const credit = (ids: string[], minutes: number, amount: number) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      const entry = byEvent.get(id) ?? { minutes: 0, amount: 0 };
      entry.minutes += minutes / ids.length;
      entry.amount += amount / ids.length;
      byEvent.set(id, entry);
    }
  };
  // Spreads an amount over events in proportion to the minutes they had in `share`.
  const spread = (share: Map<string, number>, amount: number) => {
    const total = [...share.values()].reduce((a, b) => a + b, 0);
    for (const [id, minutes] of share) credit([id], 0, total > 0 ? (amount * minutes) / total : 0);
  };
  const casual = isPaidAsCasual(person.employmentType);
  const kindOfPay = casual ? "casual" : "permanent";
  const base = person.awardLevel ? settings.awardRates[person.awardLevel] : null;
  const rateFor = (percent: number) => (base === null ? 0 : percentOf(base, percent));

  const buckets = new Map<string, { minutes: number; rate: number }>();
  const add = (label: string, rate: number, minutes: number) => {
    const bucket = buckets.get(label) ?? { minutes: 0, rate };
    bucket.minutes += minutes;
    buckets.set(label, bucket);
  };
  const loadingMinutes = new Map<
    string,
    { minutes: number; amount: number; label: string; date: string; events: Map<string, number> }
  >();
  const dayAmounts = new Map<string, number>();
  const addDayAmount = (date: string, amount: number) => dayAmounts.set(date, (dayAmounts.get(date) ?? 0) + amount);

  const dates = [...new Set(shifts.map((s) => s.date))].sort();
  const days: DayPay[] = [];
  let fortnightOrdinary = 0;
  let workedTotal = 0;

  for (const date of dates) {
    const intervals: Interval[] = shifts.filter((s) => s.date === date).map((s) => [s.absStart, s.absEnd]);
    const blocks = workBlocks(intervals);
    let dayWorked = 0;
    let dayOvertime = 0;

    for (const block of blocks) {
      let lastRate = 0;
      let lastLabel = "";
      let blockWorked = 0;
      let touchesHoliday = false;
      const blockEvents = new Map<string, number>();

      for (const [from, to] of workedIntervals(block)) {
        for (let minute = from; minute < to; minute++) {
          const calendarDate = dateOfMinute(minute);
          const kind = dayKind(calendarDate, settings);
          if (kind === "publicHoliday") touchesHoliday = true;
          const overtime =
            dayWorked >= DAILY_ORDINARY_MINUTES[kindOfPay] || fortnightOrdinary >= FORTNIGHT_ORDINARY_MINUTES;

          let label: string;
          let rate: number;
          if (overtime) {
            dayOvertime++;
            if (kind === "publicHoliday") {
              // No separate public holiday overtime rate (Table 13 note 1): the public holiday rate applies.
              const percent = PENALTY_PERCENT.publicHoliday[kindOfPay];
              [label, rate] = [`Public holiday overtime ${percent}%`, rateFor(percent)];
            } else if (kind !== "weekday") {
              [label, rate] = [`Weekend overtime ${OVERTIME_PERCENT.weekend}%`, rateFor(OVERTIME_PERCENT.weekend)];
            } else if (dayOvertime <= 120) {
              const percent = OVERTIME_PERCENT.weekdayFirst2h;
              [label, rate] = [`Overtime first 2h ${percent}%`, rateFor(percent)];
            } else {
              const percent = OVERTIME_PERCENT.weekdayAfter2h;
              [label, rate] = [`Overtime after 2h ${percent}%`, rateFor(percent)];
            }
          } else {
            fortnightOrdinary++;
            const percent = PENALTY_PERCENT[kind][kindOfPay];
            [label, rate] = [`${KIND_LABEL[kind]} ${percent}%`, rateFor(percent)];
            if (kind === "weekday") {
              const minuteOfDay = ((minute % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
              const loading =
                minuteOfDay >= 19 * 60
                  ? { label: "Evening loading Mon–Fri 7pm–midnight", amount: settings.eveningLoading }
                  : minuteOfDay < 7 * 60
                    ? { label: "Night loading Mon–Fri midnight–7am", amount: settings.nightLoading }
                    : null;
              if (loading) {
                // "per hour or part of an hour": counted per calendar day for each shift day.
                const key = `${date}|${calendarDate}|${loading.label}`;
                const entry = loadingMinutes.get(key) ?? { minutes: 0, ...loading, date, events: new Map() };
                entry.minutes++;
                for (const id of eventsAt(minute)) entry.events.set(id, (entry.events.get(id) ?? 0) + 1);
                loadingMinutes.set(key, entry);
              }
            }
          }
          add(label, rate, 1);
          addDayAmount(date, rate / 60);
          const ids = eventsAt(minute);
          credit(ids, 1, rate / 60);
          for (const id of ids) blockEvents.set(id, (blockEvents.get(id) ?? 0) + 1 / ids.length);
          [lastRate, lastLabel] = [rate, label];
          dayWorked++;
          blockWorked++;
        }
      }

      // Minimum paid time for this attendance (cl. 11.3, 29.4).
      const minimum = Math.max(
        casual ? CASUAL_MIN_ENGAGEMENT_MINUTES : 0,
        touchesHoliday ? PUBLIC_HOLIDAY_MIN_MINUTES[kindOfPay] : 0
      );
      if (blockWorked < minimum) {
        add(`Minimum paid hours (${lastLabel})`, lastRate, minimum - blockWorked);
        addDayAmount(date, ((minimum - blockWorked) * lastRate) / 60);
        spread(blockEvents, ((minimum - blockWorked) * lastRate) / 60);
      }
    }

    workedTotal += dayWorked;
    days.push({
      date,
      times: blocks.map((b) => `${formatMinutes(b.start)}–${formatMinutes(b.end)}`).join(", "),
      breaks: blocks.flatMap((b) => b.breaks.map(([s, e]) => `${formatMinutes(s)}–${formatMinutes(e)}`)),
      hours: dayWorked / 60,
      amount: null,
    });
  }

  const loadings = new Map<string, { units: number; amount: number }>();
  for (const { minutes, amount, label, date, events } of loadingMinutes.values()) {
    const units = Math.ceil(minutes / 60);
    const total = loadings.get(label) ?? { units: 0, amount };
    total.units += units;
    loadings.set(label, total);
    addDayAmount(date, units * amount);
    spread(events, units * amount);
  }

  const items: PayItem[] = [
    ...[...buckets].map(([label, { minutes, rate }]) => ({
      label,
      hours: minutes / 60,
      rate,
      amount: amountFor(minutes, rate),
    })),
    ...[...loadings].map(([label, { units, amount }]) => ({
      label,
      hours: units,
      rate: amount,
      amount: cents(units * amount),
    })),
  ];

  return {
    casual,
    baseRate: base,
    workedHours: workedTotal / 60,
    items: base === null ? [] : items,
    days: days.map((d) => ({ ...d, amount: base === null ? null : cents(dayAmounts.get(d.date) ?? 0) })),
    pay: base === null ? null : cents(items.reduce((sum, i) => sum + i.amount, 0)),
    byEvent: Object.fromEntries(
      [...byEvent].map(([id, { minutes, amount }]) => [id, { hours: minutes / 60, pay: base === null ? 0 : cents(amount) }])
    ),
  };
}

export function calculateWages(
  staff: WageStaff[],
  shifts: Shift[],
  settings: PaySettings,
  fortnightStart: string
): WageSummary {
  const fortnightEnd = addDays(fortnightStart, 13);
  const inFortnight = shifts.filter((s) => s.date >= fortnightStart && s.date <= fortnightEnd);

  const people: WageStaff[] = [...staff];
  for (const shift of inFortnight) {
    if (!people.some((p) => sameName(p.staffName, shift.staffName))) {
      people.push({ staffName: shift.staffName, employmentType: "casual", awardLevel: null });
    }
  }

  const lines = people.map((person) => ({
    staffName: person.staffName,
    employmentType: person.employmentType,
    awardLevel: person.awardLevel,
    ...payFor(
      person,
      inFortnight.filter((s) => sameName(s.staffName, person.staffName)),
      settings
    ),
  }));

  const byEvent: WageSummary["byEvent"] = {};
  for (const line of lines) {
    for (const [id, share] of Object.entries(line.byEvent)) {
      const entry = (byEvent[id] ??= { hours: 0, pay: 0, missingLevels: [] });
      entry.hours += share.hours;
      entry.pay = cents(entry.pay + share.pay);
      if (line.pay === null) entry.missingLevels.push(line.staffName);
    }
  }

  return {
    lines,
    totalHours: lines.reduce((sum, l) => sum + l.workedHours, 0),
    totalPay: cents(lines.reduce((sum, l) => sum + (l.pay ?? 0), 0)),
    missingLevels: lines.filter((l) => l.pay === null && l.workedHours > 0).map((l) => l.staffName),
    byEvent,
  };
}

// A rough cost for positions before anyone is chosen: each position paid as
// a casual at `level` for the whole of its task (minimum award rates,
// weekend/holiday rates and loadings included, no overtime interplay).
export function estimatePositions(
  positions: { key: string; date: string; absStart: number; absEnd: number; count: number }[],
  settings: PaySettings,
  level: AwardLevel = "level1"
): { hours: number; pay: number } {
  let hours = 0;
  let pay = 0;
  for (const p of positions) {
    if (p.count <= 0) continue;
    const shift = {
      eventId: p.key,
      date: p.date,
      staffName: "estimate",
      absStart: p.absStart,
      absEnd: p.absEnd,
    } as Shift;
    const line = payFor({ staffName: "estimate", employmentType: "casual", awardLevel: level }, [shift], settings);
    hours += line.workedHours * p.count;
    pay += (line.pay ?? 0) * p.count;
  }
  return { hours, pay: cents(pay) };
}
