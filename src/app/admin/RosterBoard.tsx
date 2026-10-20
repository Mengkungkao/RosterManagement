"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import type { EventRecord } from "@/lib/events";
import { type EventView, buildFortnight, staffHref } from "@/lib/overview";
import { type Gap, type HoursSummary, type Proposal, buildContext, eventWindow, formatWindow, listShifts } from "@/lib/roster";
import type { PaySettings } from "@/lib/settings";
import type { SkillDef } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import type { TaskType } from "@/lib/tasks";
import type { EventTemplate } from "@/lib/templates";
import { card, chip, messageClass, mutedText, primaryButton, secondaryButton, tones, warningText } from "../ui";
import { send } from "./api";
import EventPanel from "./EventPanel";
import GenerateReview from "./GenerateReview";
import StaffingPill from "./StaffingPill";
import TimelineView from "./TimelineView";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

interface Props {
  events: EventRecord[]; // the fortnight's events, plus a day either side for clash checks
  staff: StaffMember[];
  settings: PaySettings;
  skills: SkillDef[];
  taskTypes: TaskType[];
  templates: EventTemplate[];
  fortnightStart: string;
  today: string;
  nav: ReactNode;
  nextEvent: { date: string; name: string; href: string } | null;
  initialEventId: string | null;
  initialView: "events" | "timeline";
  autoGenerate: boolean;
}

type Message = { type: "success" | "warning" | "error"; text: string } | null;

function EventCard({ view, onSelect }: { view: EventView; onSelect: () => void }) {
  const { event, statuses, staffing } = view;
  const ev = eventWindow(event);
  const warnings = view.issues.filter((i) => i.severity === "warning").length;
  const team = [...new Set(event.staff.map((s) => s.name))];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${card} block w-full p-3 text-left transition-colors hover:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:border-zinc-600`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-zinc-900 dark:text-zinc-50">{event.name}</div>
          <div className={`text-xs tabular-nums ${mutedText}`}>
            {event.startTime}–{event.endTime}
            {event.location && ` · ${event.location}`}
          </div>
          <div className={`text-xs tabular-nums ${mutedText}`}>
            {view.span.start < ev.start && `Setup from ${formatWindow(view.span).slice(0, 5)}`}
            {view.span.start < ev.start && view.span.end > ev.end && " · "}
            {view.span.end > ev.end && `Pack-down to ${formatWindow(view.span).slice(-5)}`}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StaffingPill filled={staffing.filled} needed={staffing.needed} label="" />
          {event.status === "draft" && <span className={`${chip} ${tones.neutral}`}>Draft</span>}
          {warnings > 0 && (
            <span className={`${chip} ${tones.warn}`}>
              ⚠ {warnings} <span className="sr-only">warnings</span>
            </span>
          )}
        </div>
      </div>
      {(event.tasks.length > 0 || statuses.length > 1) && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {statuses.map((s) => {
            const ok = s.covered >= s.task.count && s.unsafe.length === 0;
            return (
              <li key={s.task.id} className={`${chip} ${ok ? tones.good : s.covered > 0 ? tones.warn : tones.bad}`}>
                <span aria-hidden="true">{ok ? "✓" : "!"}</span> {s.task.name} {s.covered}/{s.task.count}
              </li>
            );
          })}
        </ul>
      )}
      {team.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-zinc-700 dark:text-zinc-300">
          <span className={mutedText}>Team:</span> {team.join(", ")}
        </p>
      )}
      <p className={`mt-1 text-xs tabular-nums ${mutedText}`}>
        {view.hours > 0
          ? `${formatHours(view.hours)} rostered · ≈ ${money.format(view.cost)}`
          : `Planned ≈ ${formatHours(view.plannedHours)} · ${money.format(view.plannedCost)} at Level 1 casual`}
      </p>
    </button>
  );
}

function fortnightTotal(row: HoursSummary): string {
  const limit = row.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(row.employmentType);
  return limit === null ? formatHours(row.total) : `${formatHours(row.total)} / ${limit}h`;
}

function HoursTable({ rows }: { rows: HoursSummary[] }) {
  const weekClass = (row: HoursSummary, hours: number) =>
    row.employmentType === "part_time" && hours < PART_TIME_MIN_WEEKLY_HOURS ? warningText : "";
  return (
    <div className={`mt-3 overflow-x-auto ${card}`}>
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className={`border-b border-zinc-200 text-left dark:border-zinc-800 ${mutedText}`}>
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
              <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                <Link href={staffHref(row.staffName)} className="hover:underline">
                  {row.staffName}
                </Link>
              </td>
              <td className={`px-3 py-2 ${mutedText}`}>{EMPLOYMENT_LABELS[row.employmentType]}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${weekClass(row, row.week1)}`}>{formatHours(row.week1)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${weekClass(row, row.week2)}`}>{formatHours(row.week2)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fortnightTotal(row)}</td>
              <td className="px-4 py-2">
                {row.warnings.length > 0 ? (
                  <span className={warningText}>⚠ {row.warnings.join(" · ")}</span>
                ) : (
                  <span className={mutedText}>✓ OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function setUrlParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
}

export default function RosterBoard({
  events,
  staff,
  settings,
  skills,
  taskTypes,
  templates,
  fortnightStart,
  today,
  nav,
  nextEvent,
  initialEventId,
  initialView,
  autoGenerate,
}: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialEventId);
  const [view, setView] = useState<"events" | "timeline">(initialView);
  const [draft, setDraft] = useState<{ proposals: Proposal[]; gaps: Gap[] } | null>(null);

  const shifts = useMemo(() => listShifts(events), [events]);
  const fortnight = useMemo(
    () => buildFortnight(events, staff, settings, skills, fortnightStart),
    [events, staff, settings, skills, fortnightStart]
  );
  const ctx = useMemo(
    () => buildContext(staff, shifts, settings.fortnightStart, { skills, matching: settings.matching }),
    [staff, shifts, settings, skills]
  );

  const views = fortnight.events;
  const ahead = views.filter((v) => v.event.date >= today);
  const filled = ahead.reduce((sum, v) => sum + v.staffing.filled, 0);
  const needed = ahead.reduce((sum, v) => sum + v.staffing.needed, 0);
  const drafts = views.filter((v) => v.event.status === "draft").length;
  const peopleWithWarnings = fortnight.hours.filter((h) => h.warnings.length > 0).length;
  const selected = views.find((v) => v.event.id === selectedId) ?? null;
  const busy = running !== null || refreshing;

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setUrlParam("event", id);
  }, []);

  async function generate() {
    setRunning("generate");
    setMessage(null);
    const result = await send<{ proposals: Proposal[]; gaps: Gap[] }>("/api/admin/roster/generate", "POST", { fortnightStart });
    setRunning(null);
    if (!result.ok) setMessage({ type: "error", text: result.error });
    else setDraft(result.data);
  }

  const generatedOnce = useRef(false);
  useEffect(() => {
    if (!autoGenerate || generatedOnce.current) return;
    generatedOnce.current = true;
    setUrlParam("generate", null);
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  async function run(action: "clear" | "export" | "publish") {
    if (
      action === "clear" &&
      !window.confirm(
        "Take everyone who isn't locked off this fortnight's events from today on? Locked people, the events themselves and past events stay as they are."
      )
    ) {
      return;
    }
    setRunning(action);
    setMessage(null);
    const result = await send<{ cleared?: number; kept?: number; published?: number; drafts?: number }>(
      `/api/admin/roster/${action}`,
      "POST",
      { fortnightStart }
    );
    setRunning(null);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    const d = result.data;
    if (action === "clear") {
      setMessage({ type: "success", text: `Took ${d.cleared} off this fortnight's events${d.kept ? `; kept ${d.kept} locked` : ""}.` });
    } else if (action === "publish") {
      setMessage({ type: "success", text: `Published ${d.published} event${d.published === 1 ? "" : "s"}. Staff can now see these shifts.` });
    } else {
      setMessage({
        type: d.drafts ? "warning" : "success",
        text: `Saved this fortnight to the Roster tab in Google Sheets.${d.drafts ? ` ${d.drafts} draft event${d.drafts === 1 ? " was" : "s were"} left out — publish ${d.drafts === 1 ? "it" : "them"} first.` : ""}`,
      });
    }
    if (action !== "export") refresh();
  }

  const weeks = [0, 7].map((offset) => Array.from({ length: 7 }, (_, i) => addDays(fortnightStart, offset + i)));

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {nav}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={generate} disabled={busy} className={primaryButton}>
            {running === "generate" ? "Working it out…" : "Generate roster"}
          </button>
          {drafts > 0 && (
            <button type="button" onClick={() => run("publish")} disabled={busy} className={secondaryButton}>
              {running === "publish" ? "Publishing…" : `Publish ${drafts} draft${drafts === 1 ? "" : "s"}`}
            </button>
          )}
          <button type="button" onClick={() => run("clear")} disabled={busy} className={secondaryButton}>
            {running === "clear" ? "Clearing…" : "Clear unlocked"}
          </button>
          <button type="button" onClick={() => run("export")} disabled={busy} className={secondaryButton}>
            {running === "export" ? "Saving…" : "Save to Roster tab"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${mutedText}`}>
          {views.length === 0 ? (
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
              {views.length} {views.length === 1 ? "event" : "events"} · {filled} of {needed} positions filled from today
              {drafts > 0 && ` · ${drafts} draft${drafts === 1 ? "" : "s"}`}
              {peopleWithWarnings > 0 && (
                <span className={warningText}>
                  {" "}
                  · ⚠ {peopleWithWarnings} {peopleWithWarnings === 1 ? "person needs" : "people need"} a check
                </span>
              )}
              {" · "}
              <Link href={`/admin/wages?fortnight=${fortnightStart}`} className="underline">
                Wages ≈ {money.format(fortnight.wages.totalPay)}
              </Link>
              {refreshing && " · updating…"}
            </>
          )}
        </p>
        <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700" role="group" aria-label="View">
          {(["events", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setUrlParam("view", v === "events" ? null : v);
              }}
              className={`rounded-md px-3 py-1 text-sm ${
                view === v ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {v === "events" ? "Events" : "Timeline"}
            </button>
          ))}
        </div>
      </div>
      {message && <p className={`mt-2 text-sm ${messageClass(message.type)}`} role="status">{message.text}</p>}

      {view === "timeline" ? (
        <TimelineView views={views} shifts={shifts} fortnightStart={fortnightStart} today={today} onSelect={select} />
      ) : (
        weeks.map((days, w) => {
          const withEvents = days.filter((d) => views.some((v) => v.event.date === d));
          return (
            <section key={w} className="mt-5">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Week {w + 1}{" "}
                <span className={`font-normal ${mutedText}`}>
                  · {formatDayMonth(days[0])} – {formatDayMonth(days[6])}
                  {withEvents.length === 0 && " · no events"}
                </span>
              </h2>
              <div className="mt-2 space-y-4">
                {withEvents.map((date) => (
                  <div key={date} className="grid gap-2 md:grid-cols-[7.5rem_minmax(0,1fr)]">
                    <div
                      className={`text-sm font-medium md:pt-3 ${date === today ? "text-zinc-900 dark:text-zinc-50" : mutedText}`}
                    >
                      {formatWeekdayDate(date)}
                      {date === today && <span className={`ml-1 ${chip} ${tones.info}`}>today</span>}
                      {date < today && <span className="block text-xs font-normal">past</span>}
                    </div>
                    <div className={`grid gap-2 sm:grid-cols-2 xl:grid-cols-3 ${date < today ? "opacity-70" : ""}`}>
                      {views
                        .filter((v) => v.event.date === date)
                        .map((v) => (
                          <EventCard key={v.event.id} view={v} onSelect={() => select(v.event.id)} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Hours this fortnight{" "}
          <span className={`font-normal ${mutedText}`}>
            · after unpaid breaks · students up to {STUDENT_MAX_FORTNIGHT_HOURS}h, full-time and casual up to{" "}
            {FULL_TIME_FORTNIGHT_HOURS}h, part-time at least {PART_TIME_MIN_WEEKLY_HOURS}h a week, everyone at most{" "}
            {DAILY_MAX_HOURS}h a day
          </span>
        </h2>
        {fortnight.hours.length === 0 ? (
          <p className={`mt-2 text-sm ${mutedText}`}>
            No staff yet — add them on the <Link href="/admin/staff" className="underline">Staff</Link> tab.
          </p>
        ) : (
          <HoursTable rows={fortnight.hours} />
        )}
      </section>

      {selected && (
        <EventPanel
          key={selected.event.id}
          view={selected}
          ctx={ctx}
          skills={skills}
          taskTypes={taskTypes}
          templates={templates}
          busy={refreshing}
          onSaved={refresh}
          onClose={() => select(null)}
        />
      )}
      {draft && (
        <GenerateReview
          proposals={draft.proposals}
          gaps={draft.gaps}
          onClose={() => setDraft(null)}
          onOpenEvent={(id) => {
            setDraft(null);
            select(id);
          }}
          onApplied={(m) => {
            setDraft(null);
            setMessage(m);
            refresh();
          }}
        />
      )}
    </>
  );
}
