// What the Dashboard and Roster pages show about events: each task's
// staffing, the warnings, hours and estimated cost. Pure functions only, so
// the server (Dashboard) and the browser (Roster) work it out the same way.

import { addDays, dayNumber, formatDayMonth, formatWeekdayDate, MINUTES_IN_DAY } from "./dates";
import type { EventRecord } from "./events";
import {
  type EventStaffing,
  type HoursSummary,
  type Issue,
  type RosterStaff,
  type TaskStatus,
  type TimeWindow,
  buildContext,
  eventIssues,
  eventSpan,
  eventStaffing,
  eventTasks,
  eventsInRange,
  listShifts,
  summarizeHours,
  taskStatuses,
  taskWindow,
} from "./roster";
import type { PaySettings } from "./settings";
import type { SkillDef } from "./skills";
import type { StaffMember } from "./staff";
import { type WageSummary, calculateWages, estimatePositions } from "./wages";

export interface EventView {
  event: EventRecord;
  statuses: TaskStatus[];
  staffing: EventStaffing;
  issues: Issue[];
  span: TimeWindow; // first task start → last task end
  hours: number; // rostered worked hours (shared time split between functions)
  cost: number; // minimum pay of the rostered people who have an award level
  missingLevels: string[]; // rostered people with no award level (not in `cost`)
  plannedHours: number; // every position filled for its whole task
  plannedCost: number; // …paid as a Level 1 casual — a rough estimate before people are chosen
}

export interface FortnightView {
  events: EventView[]; // the fortnight's events, in date order
  hours: HoursSummary[];
  wages: WageSummary;
}

// The positions of an event's tasks, for a cost estimate before anyone is rostered.
export function plannedPositions(event: EventRecord) {
  const base = dayNumber(event.date) * MINUTES_IN_DAY;
  return eventTasks(event).map((t) => {
    const w = taskWindow(event, t);
    return { key: `${event.id}|${t.id}`, date: event.date, absStart: base + w.start, absEnd: base + w.end, count: t.count };
  });
}

// `events` should include a day either side of the fortnight, so overnight
// shifts next to it still show as clashes.
export function buildFortnight(
  events: EventRecord[],
  staff: RosterStaff[] | StaffMember[],
  settings: PaySettings,
  skills: SkillDef[],
  fortnightStart: string
): FortnightView {
  const shifts = listShifts(events);
  const ctx = buildContext(staff, shifts, settings.fortnightStart, { skills, matching: settings.matching });
  const wages = calculateWages(
    (staff as StaffMember[]).map((s) => ({
      staffName: s.staffName,
      employmentType: s.employmentType,
      awardLevel: "awardLevel" in s ? s.awardLevel : null,
    })),
    shifts,
    settings,
    fortnightStart
  );
  const views = eventsInRange(events, fortnightStart, 14).map((event): EventView => {
    const statuses = taskStatuses(event, ctx);
    const share = wages.byEvent[event.id];
    const planned = estimatePositions(plannedPositions(event), settings);
    return {
      event,
      statuses,
      staffing: eventStaffing(event, statuses),
      issues: eventIssues(event, statuses),
      span: eventSpan(event),
      hours: share?.hours ?? 0,
      cost: share?.pay ?? 0,
      missingLevels: share?.missingLevels ?? [],
      plannedHours: planned.hours,
      plannedCost: planned.pay,
    };
  });
  return { events: views, hours: summarizeHours(staff, shifts, fortnightStart), wages };
}

export const nearbyEvents = (events: EventRecord[], fortnightStart: string) =>
  events.filter((e) => e.date >= addDays(fortnightStart, -1) && e.date <= addDays(fortnightStart, 14));

// --- Dashboard: things to act on -------------------------------------------------

export interface AttentionItem {
  kind: "open" | "conflict" | "hours" | "draft" | "expiring" | "sheet";
  severity: "warning" | "info";
  title: string;
  detail: string;
  href: string;
}

export function rosterHref(fortnightStart: string, eventId?: string) {
  return `/admin/roster?fortnight=${fortnightStart}${eventId ? `&event=${encodeURIComponent(eventId)}` : ""}`;
}

export function staffHref(name: string) {
  return `/admin/staff?person=${encodeURIComponent(name)}`;
}

const when = (e: EventRecord) => `${formatWeekdayDate(e.date)} ${e.startTime}`;

// Problems from today on, worst first: open positions, people who can't
// work what they're on, hour limits, unpublished drafts, expiring checks.
export function attentionItems(
  view: FortnightView,
  staff: StaffMember[],
  skills: SkillDef[],
  today: string,
  fortnightStart: string,
  unreadableEvents: number
): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (unreadableEvents > 0) {
    items.push({
      kind: "sheet",
      severity: "warning",
      title: `${unreadableEvents} row${unreadableEvents === 1 ? "" : "s"} in the Events tab can't be read`,
      detail: "Check the date, times and Tasks cells in the sheet. They are kept as they are until fixed.",
      href: "/admin/events",
    });
  }
  for (const v of view.events) {
    if (v.event.date < today) continue;
    const open = v.statuses.filter((s) => s.task.mandatory && s.covered < s.task.count);
    if (open.length > 0) {
      items.push({
        kind: "open",
        severity: "warning",
        title: `${v.event.name}: ${v.staffing.needed - v.staffing.filled} open position${v.staffing.needed - v.staffing.filled === 1 ? "" : "s"}`,
        detail: `${when(v.event)} · ${open.map((s) => `${s.task.name} ${s.covered}/${s.task.count}`).join(", ")}`,
        href: rosterHref(fortnightStart, v.event.id),
      });
    }
    const conflicts = v.issues.filter((i) => i.severity === "warning");
    if (conflicts.length > 0) {
      items.push({
        kind: "conflict",
        severity: "warning",
        title: `${v.event.name}: ${conflicts.length} roster problem${conflicts.length === 1 ? "" : "s"}`,
        detail: `${when(v.event)} · ${conflicts[0].text}${conflicts.length > 1 ? ` (+${conflicts.length - 1} more)` : ""}`,
        href: rosterHref(fortnightStart, v.event.id),
      });
    }
    if (v.event.status === "draft") {
      items.push({
        kind: "draft",
        severity: "info",
        title: `${v.event.name} is a draft`,
        detail: `${when(v.event)} · staff can't see it until it's published`,
        href: rosterHref(fortnightStart, v.event.id),
      });
    }
  }
  for (const row of view.hours) {
    const serious = row.warnings.filter((w) => !/^Week \d under/.test(w));
    if (serious.length === 0) continue;
    items.push({
      kind: "hours",
      severity: "warning",
      title: `${row.staffName}: ${serious.join(" · ")}`,
      detail: "Hours this fortnight",
      href: staffHref(row.staffName),
    });
  }
  const soon = addDays(today, 30);
  for (const person of staff) {
    if (!person.active) continue;
    for (const [id, record] of Object.entries(person.skills)) {
      if (!record.expiresOn || record.expiresOn > soon) continue;
      const name = skills.find((s) => s.id === id)?.name ?? id;
      const expired = record.expiresOn < today;
      items.push({
        kind: "expiring",
        severity: expired ? "warning" : "info",
        title: `${person.staffName}: ${name} ${expired ? "expired" : "expires"} ${formatDayMonth(record.expiresOn)}`,
        detail: expired ? "Not counted until it's renewed and updated on their profile" : "Renew before it lapses",
        href: staffHref(person.staffName),
      });
    }
  }
  const rank = { sheet: 0, conflict: 1, open: 2, hours: 3, expiring: 4, draft: 5 };
  return items.sort((a, b) => Number(a.severity !== "warning") - Number(b.severity !== "warning") || rank[a.kind] - rank[b.kind]);
}
