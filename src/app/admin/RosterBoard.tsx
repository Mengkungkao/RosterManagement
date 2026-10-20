"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDays, formatDayMonth, formatHours, formatWeekdayDate } from "@/lib/dates";
import {
  DAILY_MAX_HOURS,
  EMPLOYMENT_LABELS,
  FULL_TIME_FORTNIGHT_HOURS,
  PART_TIME_MIN_WEEKLY_HOURS,
  STUDENT_MAX_FORTNIGHT_HOURS,
  softFortnightLimit,
} from "@/lib/employment";
import { colorForEvent } from "@/lib/event-colors";
import type { EventRecord } from "@/lib/events";
import {
  eventsInRange,
  listShifts,
  minCoverage,
  rosterIssues,
  summarizeHours,
  type HoursSummary,
} from "@/lib/roster";
import type { StaffMember } from "@/lib/staff";
import { card, messageClass, mutedText, primaryButton, secondaryButton, warningText } from "../ui";
import EventPanel from "./EventPanel";
import StaffingPill from "./StaffingPill";

interface Props {
  events: EventRecord[]; // the fortnight's events, plus a day either side for clash checks
  staff: StaffMember[];
  fortnightStart: string;
  anchor: string;
  today: string;
  nav: ReactNode;
  nextEvent: { date: string; name: string; href: string } | null;
}

type Message = { type: "success" | "warning" | "error"; text: string } | null;

function EventCard({
  event,
  issues,
  onSelect,
}: {
  event: EventRecord;
  issues: string[];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg p-2 text-left text-xs leading-snug transition-opacity hover:opacity-80 ${colorForEvent(event.id)}`}
    >
      <div className="font-semibold">{event.name}</div>
      <div className="tabular-nums opacity-80">
        {event.startTime}–{event.endTime}
        {event.location && ` · ${event.location}`}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <StaffingPill filled={minCoverage(event)} needed={event.staffNeeded} />
        {event.shareStaff && (
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold dark:bg-black/30" title="Staff can also work other functions at the same time">
            shares staff
          </span>
        )}
        {issues.length > 0 && (
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-black/30 dark:text-amber-300">
            ⚠ {issues.length}
          </span>
        )}
      </div>
      {event.staff.length > 0 && (
        <div className="mt-1 opacity-90">
          {event.staff.map((s) => (s.startTime ? `${s.name} ${s.startTime}–${s.endTime}` : s.name)).join(", ")}
        </div>
      )}
    </button>
  );
}

function fortnightTotal(row: HoursSummary): string {
  const limit =
    row.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(row.employmentType);
  return limit === null ? formatHours(row.total) : `${formatHours(row.total)} / ${limit}h`;
}

function HoursTable({ rows }: { rows: HoursSummary[] }) {
  const weekClass = (row: HoursSummary, hours: number) =>
    row.employmentType === "part_time" && hours < PART_TIME_MIN_WEEKLY_HOURS ? warningText : "";
  return (
    <div className={`mt-3 overflow-x-auto ${card}`}>
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="px-4 py-2.5 font-medium">Staff</th>
            <th className="px-3 py-2.5 font-medium">Type</th>
            <th className="px-3 py-2.5 text-right font-medium">Week 1</th>
            <th className="px-3 py-2.5 text-right font-medium">Week 2</th>
            <th className="px-3 py-2.5 text-right font-medium">Fortnight</th>
            <th className="px-4 py-2.5 font-medium">Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.staffName} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
              <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">{row.staffName}</td>
              <td className={`px-3 py-2 ${mutedText}`}>{EMPLOYMENT_LABELS[row.employmentType]}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${weekClass(row, row.week1)}`}>
                {formatHours(row.week1)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${weekClass(row, row.week2)}`}>
                {formatHours(row.week2)}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fortnightTotal(row)}</td>
              <td className="px-4 py-2">
                {row.warnings.length > 0 ? (
                  <span className={warningText}>{row.warnings.join(" · ")}</span>
                ) : (
                  <span className={mutedText}>OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RosterBoard({ events, staff, fortnightStart, anchor, today, nav, nextEvent }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shifts = useMemo(() => listShifts(events), [events]);
  const fortnightEvents = useMemo(() => eventsInRange(events, fortnightStart, 14), [events, fortnightStart]);
  const hours = useMemo(() => summarizeHours(staff, shifts, fortnightStart), [staff, shifts, fortnightStart]);
  const issues = useMemo(
    () => new Map(fortnightEvents.map((e) => [e.id, rosterIssues(e, staff, shifts)])),
    [fortnightEvents, staff, shifts]
  );

  const places = fortnightEvents.reduce((sum, e) => sum + e.staffNeeded, 0);
  const filled = fortnightEvents.reduce((sum, e) => sum + Math.min(minCoverage(e), e.staffNeeded), 0);
  const peopleWithWarnings = hours.filter((h) => h.warnings.length > 0).length;
  const selected = events.find((e) => e.id === selectedId) ?? null;
  const busy = running !== null || refreshing;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function run(action: "auto-fill" | "clear" | "export") {
    if (
      action === "clear" &&
      !window.confirm(
        "Take everyone off this fortnight's events from today on? The events stay, and past events keep their roster."
      )
    ) {
      return;
    }
    setRunning(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/roster/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fortnightStart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (action === "auto-fill") {
        const short = (data.shortfalls as { eventName: string; date: string; missing: number }[])
          .map((s) => `${s.eventName} (${formatWeekdayDate(s.date)}) needs ${s.missing} more`)
          .join("; ");
        setMessage({
          type: short ? "warning" : "success",
          text:
            `Added ${data.added} ${data.added === 1 ? "person" : "people"}.` +
            (short ? ` No one else free and within their hours for: ${short}.` : " Every place is filled."),
        });
      } else if (action === "clear") {
        setMessage({ type: "success", text: `Took ${data.cleared} people off this fortnight's events.` });
      } else {
        setMessage({ type: "success", text: "Saved this fortnight to the Roster tab in Google Sheets." });
      }
      if (action !== "export") refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {nav}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run("auto-fill")} disabled={busy} className={primaryButton}>
            {running === "auto-fill" ? "Filling…" : "Auto-fill open shifts"}
          </button>
          <button type="button" onClick={() => run("clear")} disabled={busy} className={secondaryButton}>
            {running === "clear" ? "Clearing…" : "Clear fortnight"}
          </button>
          <button type="button" onClick={() => run("export")} disabled={busy} className={secondaryButton}>
            {running === "export" ? "Saving…" : "Save to Roster tab"}
          </button>
        </div>
      </div>

      <p className={`mt-3 text-sm ${mutedText}`}>
        {fortnightEvents.length === 0 ? (
          <>
            No events this fortnight.{" "}
            {nextEvent && (
              <Link href={nextEvent.href} className="underline">
                Next event: {nextEvent.name}, {formatWeekdayDate(nextEvent.date)}
              </Link>
            )}
          </>
        ) : (
          <>
            {fortnightEvents.length} {fortnightEvents.length === 1 ? "event" : "events"} · {filled} of {places}{" "}
            places filled
            {peopleWithWarnings > 0 && (
              <span className={warningText}>
                {" "}
                · {peopleWithWarnings} {peopleWithWarnings === 1 ? "person needs" : "people need"} a check
              </span>
            )}
            {refreshing && " · updating…"}
          </>
        )}
      </p>
      {message && <p className={`mt-2 text-sm ${messageClass(message.type)}`}>{message.text}</p>}

      {[0, 7].map((offset) => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(fortnightStart, offset + i));
        return (
          <section key={offset} className="mt-5">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Week {offset === 0 ? 1 : 2}{" "}
              <span className={`font-normal ${mutedText}`}>
                · {formatDayMonth(days[0])} – {formatDayMonth(days[6])}
              </span>
            </h2>
            <div className="mt-2 grid gap-2 md:grid-cols-7">
              {days.map((date) => {
                const dayEvents = fortnightEvents.filter((e) => e.date === date);
                return (
                  <div
                    key={date}
                    className={`${card} min-h-24 p-2 ${dayEvents.length === 0 ? "hidden md:block" : ""} ${
                      date === today ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : ""
                    }`}
                  >
                    <div className={`text-xs font-medium ${date === today ? "text-zinc-900 dark:text-zinc-50" : mutedText}`}>
                      {formatWeekdayDate(date)}
                      {date === today && " · today"}
                    </div>
                    <div className="mt-1.5 space-y-1.5">
                      {dayEvents.map((e) => (
                        <EventCard
                          key={e.id}
                          event={e}
                          issues={issues.get(e.id) ?? []}
                          onSelect={() => setSelectedId(e.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Hours this fortnight{" "}
          <span className={`font-normal ${mutedText}`}>
            · after unpaid breaks · students up to {STUDENT_MAX_FORTNIGHT_HOURS}h, full-time and casual up to{" "}
            {FULL_TIME_FORTNIGHT_HOURS}h, part-time at least {PART_TIME_MIN_WEEKLY_HOURS}h a week, everyone at most{" "}
            {DAILY_MAX_HOURS}h a day
          </span>
        </h2>
        {hours.length === 0 ? (
          <p className={`mt-2 text-sm ${mutedText}`}>
            No staff yet — add them on the <Link href="/admin/staff" className="underline">Staff</Link> tab.
          </p>
        ) : (
          <HoursTable rows={hours} />
        )}
      </section>

      {selected && (
        <EventPanel
          key={selected.id}
          event={selected}
          staff={staff}
          shifts={shifts}
          anchor={anchor}
          issues={issues.get(selected.id) ?? rosterIssues(selected, staff, shifts)}
          busy={refreshing}
          onSaved={refresh}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
