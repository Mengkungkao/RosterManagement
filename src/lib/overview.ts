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

// --- Roster status -------------------------------------------------------------

export type RosterStatusKey = "draft" | "attention" | "ready" | "published";

export interface RosterStatus {
  key: RosterStatusKey;
  label: string;
  detail: string;
}

// One label per event. "Complete" means every mandatory task is covered by
// people who pass every check for the whole of its time, team work has full
// teams and safety controls are confirmed — not just that names are filled in.
export function rosterStatus(v: EventView): RosterStatus {
  const warnings = v.issues.filter((i) => i.severity === "warning").length;
  const open = Math.max(0, v.staffing.needed - v.staffing.filled);
  const openText = `${open} open position${open === 1 ? "" : "s"}`;
  if (warnings > 0) {
    return { key: "attention", label: "Needs attention", detail: `${warnings} problem${warnings === 1 ? "" : "s"} to sort out` };
  }
  if (v.event.status === "published") {
    return v.staffing.complete
      ? { key: "published", label: "Published", detail: "Staff can see their shifts" }
      : { key: "attention", label: "Needs attention", detail: `Published with ${openText}` };
  }
  return v.staffing.complete
    ? { key: "ready", label: "Ready for review", detail: "Every position filled and checked — publish when ready" }
    : { key: "draft", label: "Draft", detail: open > 0 ? openText : "Not published yet" };
}

// --- Dashboard: things to act on -------------------------------------------------

export function rosterHref(fortnightStart: string, eventId?: string, taskId?: string) {
  const params = new URLSearchParams({ fortnight: fortnightStart });
  if (eventId) params.set("event", eventId);
  if (taskId) params.set("task", taskId);
  return `/admin/roster?${params}`;
}

export function staffHref(name: string) {
  return `/admin/staff?person=${encodeURIComponent(name)}`;
}

const when = (e: EventRecord) => `${formatWeekdayDate(e.date)} ${e.startTime}`;

export interface DashboardItem {
  title: string;
  detail: string;
  href: string;
  severity: "warning" | "info";
}

export interface Dashboard {
  fortnightStart: string;
  today: EventView[];
  upcoming: EventView[]; // from today, the next 14 days, in date order
  hrefFor: Record<string, string>; // event id → its roster link
  metrics: {
    upcomingEvents: number; // today to the end of the fortnight
    unfilled: number; // open mandatory positions, today to the end of the fortnight
    conflicts: number; // warnings on those events
    rosteredHours: number; // this fortnight
    plannedHours: number; // every position filled, this fortnight
    cost: number; // estimated minimum pay this fortnight
    missingLevels: number; // rostered people without an award level (not in cost)
  };
  openPositions: DashboardItem[];
  conflicts: DashboardItem[];
  availability: DashboardItem[];
  expiries: DashboardItem[];
  hours: DashboardItem[];
  drafts: DashboardItem[];
  sheet: DashboardItem[];
  attentionCount: number; // for the bell: things that need a decision
}

const AVAILABILITY_CODES = new Set(["unavailable", "time_off"]);

// Everything the Dashboard shows, from this fortnight and the next (so the
// next 14 days are always covered).
export function buildDashboard(
  events: EventRecord[],
  staff: StaffMember[],
  settings: PaySettings,
  skills: SkillDef[],
  today: string,
  fortnightStart: string,
  unreadableEvents = 0,
  pendingRequests = 0
): Dashboard {
  const current = buildFortnight(nearbyEvents(events, fortnightStart), staff, settings, skills, fortnightStart);
  const nextStart = addDays(fortnightStart, 14);
  const next = buildFortnight(nearbyEvents(events, nextStart), staff, settings, skills, nextStart);
  const all = [...current.events, ...next.events];
  const hrefFor = Object.fromEntries(
    all.map((v) => [v.event.id, rosterHref(v.event.date < nextStart ? fortnightStart : nextStart, v.event.id)])
  );
  const ahead = current.events.filter((v) => v.event.date >= today);
  const upcoming = all.filter((v) => v.event.date >= today && v.event.date <= addDays(today, 13));

  const openPositions: DashboardItem[] = [];
  const conflicts: DashboardItem[] = [];
  const availability: DashboardItem[] = [];
  const drafts: DashboardItem[] = [];
  for (const v of upcoming) {
    for (const s of v.statuses) {
      const missing = s.task.count - s.covered;
      if (!s.task.mandatory || missing <= 0) continue;
      openPositions.push({
        title: `${s.task.name} ${s.covered}/${s.task.count}`,
        detail: `${v.event.name} · ${when(v.event)}`,
        href: rosterHref(v.event.date < nextStart ? fortnightStart : nextStart, v.event.id, s.task.id),
        severity: "warning",
      });
    }
    for (const issue of v.issues) {
      if (issue.severity !== "warning") continue;
      const item = {
        title: issue.text,
        detail: `${v.event.name} · ${when(v.event)}`,
        href: rosterHref(v.event.date < nextStart ? fortnightStart : nextStart, v.event.id, issue.taskId),
        severity: "warning" as const,
      };
      (AVAILABILITY_CODES.has(issue.code) ? availability : conflicts).push(item);
    }
    if (v.event.status === "draft") {
      drafts.push({ title: `${v.event.name} is a draft`, detail: `${when(v.event)} · staff can't see it yet`, href: hrefFor[v.event.id], severity: "info" });
    }
  }

  const hours: DashboardItem[] = current.hours
    .map((row) => ({ row, serious: row.warnings.filter((w) => !/^Week \d under/.test(w)) }))
    .filter(({ serious }) => serious.length > 0)
    .map(({ row, serious }) => ({ title: `${row.staffName}: ${serious.join(" · ")}`, detail: "Hours this fortnight", href: staffHref(row.staffName), severity: "warning" }));

  const soon = addDays(today, 30);
  const expiries: DashboardItem[] = [];
  for (const person of staff) {
    if (!person.active) continue;
    for (const [id, record] of Object.entries(person.skills)) {
      if (!record.expiresOn || record.expiresOn > soon) continue;
      const name = skills.find((s) => s.id === id)?.name ?? id;
      const expired = record.expiresOn < today;
      expiries.push({
        title: `${person.staffName}: ${name} ${expired ? "expired" : "expires"} ${formatDayMonth(record.expiresOn)}`,
        detail: expired ? "Not counted until it's renewed on their profile" : "Renew before it lapses",
        href: staffHref(person.staffName),
        severity: expired ? "warning" : "info",
      });
    }
  }
  expiries.sort((a, b) => Number(a.severity !== "warning") - Number(b.severity !== "warning"));

  const sheet: DashboardItem[] =
    unreadableEvents > 0
      ? [
          {
            title: `${unreadableEvents} row${unreadableEvents === 1 ? "" : "s"} in the Events tab can't be read`,
            detail: "Check the date, times and Tasks cells in the sheet. They're kept as they are until fixed.",
            href: "/admin/events",
            severity: "warning",
          },
        ]
      : [];

  return {
    fortnightStart,
    today: current.events.filter((v) => v.event.date === today).concat(next.events.filter((v) => v.event.date === today)),
    upcoming,
    hrefFor,
    metrics: {
      upcomingEvents: ahead.length,
      unfilled: ahead.reduce((sum, v) => sum + Math.max(0, v.staffing.needed - v.staffing.filled), 0),
      conflicts: ahead.reduce((sum, v) => sum + v.issues.filter((i) => i.severity === "warning").length, 0),
      rosteredHours: current.wages.totalHours,
      plannedHours: current.events.reduce((sum, v) => sum + v.plannedHours, 0),
      cost: current.wages.totalPay,
      missingLevels: current.wages.missingLevels.length,
    },
    openPositions,
    conflicts,
    availability,
    expiries,
    hours,
    drafts,
    sheet,
    // The same items the Dashboard lists under "Needs attention", plus requests waiting.
    attentionCount:
      pendingRequests + sheet.length + conflicts.length + openPositions.length + availability.length + expiries.length + hours.length,
  };
}
