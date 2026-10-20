"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, formatDateRange, formatDayMonth, formatHours, formatWeekdayDate } from "@/lib/dates";
import type { EventRecord } from "@/lib/events";
import { type EventView, buildFortnight, rosterStatus } from "@/lib/overview";
import { type Gap, type Proposal, buildContext, listShifts } from "@/lib/roster";
import type { PaySettings } from "@/lib/settings";
import type { SkillDef } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import type { TaskType } from "@/lib/tasks";
import type { EventTemplate } from "@/lib/templates";
import { send } from "../admin/api";
import { PageHeader } from "../shell/PageHeader";
import { Button, ButtonLink, IconButton } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SearchInput, Select } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { Segmented } from "../ui/Segmented";
import { cn } from "../ui/cn";
import { useConfirm, useToast } from "../ui/feedback";
import EventRow from "./EventRow";
import GenerateReview from "./GenerateReview";
import StaffGrid from "./StaffGrid";
import TaskDrawer from "./TaskDrawer";
import TasksDrawer from "./TasksDrawer";
import TimelineView from "./TimelineView";
import { type Filters, GROUP_LABELS, GROUP_ORDER, type GroupKey, groupOf, matchesFilters, money } from "./model";

type View = "events" | "timeline" | "staff";
type Range = "all" | "w1" | "w2";
type Panel = { kind: "task"; eventId: string; taskId: string } | { kind: "tasks"; eventId: string } | null;

function setUrl(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(null, "", url);
}

export default function RosterWorkspace({
  events,
  staff,
  settings,
  skills,
  taskTypes,
  templates,
  fortnightStart,
  currentFortnight,
  today,
  nextEvent,
  initialEventId,
  initialTaskId,
  initialView,
  autoGenerate,
}: {
  events: EventRecord[]; // the fortnight's events, plus a day either side for clash checks
  staff: StaffMember[];
  settings: PaySettings;
  skills: SkillDef[];
  taskTypes: TaskType[];
  templates: EventTemplate[];
  fortnightStart: string;
  currentFortnight: string;
  today: string;
  nextEvent: { date: string; name: string; href: string } | null;
  initialEventId: string | null;
  initialTaskId: string | null;
  initialView: View;
  autoGenerate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [refreshing, startRefresh] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [range, setRange] = useState<Range>("all");
  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [group, setGroup] = useState<GroupKey | "">("");
  const [showFilters, setShowFilters] = useState(false);
  const [panel, setPanel] = useState<Panel>(
    initialEventId && initialTaskId ? { kind: "task", eventId: initialEventId, taskId: initialTaskId } : null
  );
  const [draft, setDraft] = useState<{ proposals: Proposal[]; gaps: Gap[] } | null>(null);

  const shifts = useMemo(() => listShifts(events), [events]);
  const fortnight = useMemo(() => buildFortnight(events, staff, settings, skills, fortnightStart), [events, staff, settings, skills, fortnightStart]);
  const ctx = useMemo(
    () => buildContext(staff, shifts, settings.fortnightStart, { skills, matching: settings.matching }),
    [staff, shifts, settings, skills]
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (initialEventId) return new Set([initialEventId]);
    // Open what still needs work from today on.
    return new Set(fortnight.events.filter((v) => v.event.date >= today && rosterStatus(v).key !== "published").map((v) => v.event.id));
  });

  const allDays = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(fortnightStart, i)), [fortnightStart]);
  const days = range === "w1" ? allDays.slice(0, 7) : range === "w2" ? allDays.slice(7) : allDays;
  const filters: Filters = { search, eventId, staffName, group, days };
  const filtered = fortnight.events.filter((v) => matchesFilters(v, filters, taskTypes));
  const ahead = fortnight.events.filter((v) => v.event.date >= today);
  const filled = ahead.reduce((sum, v) => sum + v.staffing.filled, 0);
  const needed = ahead.reduce((sum, v) => sum + v.staffing.needed, 0);
  const attention = ahead.filter((v) => rosterStatus(v).key === "attention").length;
  const publishable = fortnight.events.filter((v) => v.event.status === "draft" && v.event.date >= today);
  const filtering = Boolean(search || eventId || staffName || group || range !== "all");
  const busy = running !== null || refreshing;
  const groupsPresent = GROUP_ORDER.filter((g) => fortnight.events.some((v) => v.statuses.some((s) => groupOf(s, taskTypes) === g)));
  const peopleOnRoster = staff.filter((s) => s.active || shifts.some((sh) => sh.staffName.toLowerCase() === s.staffName.toLowerCase()));

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const openTask = useCallback((eventId: string, taskId: string) => {
    setPanel({ kind: "task", eventId, taskId });
    setExpanded((all) => new Set(all).add(eventId));
    setUrl({ event: eventId, task: taskId });
  }, []);
  const closePanel = useCallback(() => {
    setPanel(null);
    setUrl({ task: null });
  }, []);

  // Scroll a linked event into view once.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !initialEventId) return;
    scrolled.current = true;
    document.getElementById(`row-${initialEventId}`)?.scrollIntoView({ block: "start" });
  }, [initialEventId]);

  const generate = useCallback(async () => {
    setRunning("generate");
    const result = await send<{ proposals: Proposal[]; gaps: Gap[] }>("/api/admin/roster/generate", "POST", { fortnightStart });
    setRunning(null);
    if (!result.ok) toast.error(result.error);
    else setDraft(result.data);
  }, [fortnightStart, toast]);

  const generatedOnce = useRef(false);
  useEffect(() => {
    if (!autoGenerate || generatedOnce.current) return;
    generatedOnce.current = true;
    setUrl({ generate: null });
    generate();
  }, [autoGenerate, generate]);

  async function run(action: "clear" | "export" | "publish") {
    if (action === "clear") {
      const ok = await confirm({
        title: "Clear unlocked assignments?",
        description: (
          <>
            Everyone who isn&apos;t locked comes off this fortnight&apos;s events from today on (
            {formatDateRange([fortnightStart, today].sort()[1], addDays(fortnightStart, 13))}). Locked people, the events
            themselves and past events stay as they are. This can&apos;t be undone.
          </>
        ),
        confirmLabel: "Clear unlocked",
        tone: "danger",
      });
      if (!ok) return;
    }
    if (action === "publish") {
      const ok = await confirm({
        title: `Publish ${publishable.length} draft event${publishable.length === 1 ? "" : "s"}?`,
        description: (
          <>
            Staff will see their shifts on: {publishable.map((v) => v.event.name).join(", ")}.
            {publishable.some((v) => !v.staffing.complete) && " Some still have open positions — you can keep filling them after publishing."}
          </>
        ),
        confirmLabel: "Publish",
        tone: "primary",
      });
      if (!ok) return;
    }
    setRunning(action);
    const result = await send<{ cleared?: number; kept?: number; published?: number; drafts?: number }>(
      `/api/admin/roster/${action}`,
      "POST",
      { fortnightStart }
    );
    setRunning(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const d = result.data;
    if (action === "clear") toast.success(`Took ${d.cleared} assignment${d.cleared === 1 ? "" : "s"} off${d.kept ? `; kept ${d.kept} locked` : ""}.`);
    else if (action === "publish") toast.success(`Published ${d.published} event${d.published === 1 ? "" : "s"}. Staff can now see these shifts.`);
    else
      toast.success(
        `Saved this fortnight to the Roster tab in Google Sheets.${d.drafts ? ` ${d.drafts} draft event${d.drafts === 1 ? " was" : "s were"} left out until published.` : ""}`
      );
    if (action !== "export") refresh();
  }

  const panelView: EventView | undefined = panel ? fortnight.events.find((v) => v.event.id === panel.eventId) : undefined;
  const panelTask = panel?.kind === "task" && panelView ? panelView.statuses.find((s) => s.task.id === panel.taskId) : undefined;
  const dayGroups = days.map((d) => ({ date: d, items: filtered.filter((v) => v.event.date === d) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        description="Fill each event's tasks with people who pass every check. Open a task to see who fits and why, or generate a draft for the whole fortnight."
        actions={
          <>
            {publishable.length > 0 && (
              <Button icon="send" onClick={() => run("publish")} loading={running === "publish"} disabled={busy}>
                Publish {publishable.length} draft{publishable.length === 1 ? "" : "s"}
              </Button>
            )}
            <Button variant="primary" icon="sparkle" onClick={generate} loading={running === "generate"} disabled={busy}>
              Generate roster
            </Button>
            <Menu
              label="More roster actions"
              items={[
                { label: "Clear unlocked assignments", icon: "trash", onSelect: () => run("clear"), tone: "danger", disabled: busy },
                { label: "Save to Roster tab (Google Sheet)", icon: "fileText", onSelect: () => run("export"), disabled: busy },
                { label: "Hours and wages report", icon: "chart", href: `/admin/reports?fortnight=${fortnightStart}` },
              ]}
              trigger={(p) => <IconButton icon="more" label="More roster actions" variant="secondary" onClick={p.toggle} aria-expanded={p["aria-expanded"]} aria-haspopup="menu" />}
            />
          </>
        }
      />

      <Card className="mb-4" as="div">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-1">
            <ButtonLink href={`/admin/roster?fortnight=${addDays(fortnightStart, -14)}`} variant="ghost" size="sm" className="w-8 px-0" aria-label="Previous fortnight">
              <Icon name="chevronLeft" size={16} />
            </ButtonLink>
            <span className="min-w-40 text-center text-sm font-semibold text-fg tabular-nums">{formatDateRange(fortnightStart, addDays(fortnightStart, 13))}</span>
            <ButtonLink href={`/admin/roster?fortnight=${addDays(fortnightStart, 14)}`} variant="ghost" size="sm" className="w-8 px-0" aria-label="Next fortnight">
              <Icon name="chevronRight" size={16} />
            </ButtonLink>
            {fortnightStart === currentFortnight ? (
              <Button
                size="sm"
                onClick={() => {
                  setRange(today < addDays(fortnightStart, 7) ? "w1" : "w2");
                  document.getElementById(`day-${today}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
                }}
              >
                Today
              </Button>
            ) : (
              <ButtonLink size="sm" href={`/admin/roster?fortnight=${currentFortnight}`}>
                Today
              </ButtonLink>
            )}
          </div>
          <Segmented<Range>
            label="Period"
            size="sm"
            value={range}
            onChange={setRange}
            options={[
              { value: "all", label: "Fortnight" },
              { value: "w1", label: `Week 1 · ${formatDayMonth(fortnightStart)}` },
              { value: "w2", label: `Week 2 · ${formatDayMonth(addDays(fortnightStart, 7))}` },
            ]}
          />
          <Button
            size="sm"
            icon="filter"
            className="sm:hidden"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters{filtering ? " · on" : ""}
          </Button>
          <Segmented<View>
            label="View"
            size="sm"
            className="ml-auto"
            value={view}
            onChange={(v) => {
              setView(v);
              setUrl({ view: v === "events" ? null : v });
            }}
            options={[
              { value: "events", label: "Events", icon: "list" },
              { value: "timeline", label: "Timeline", icon: "timeline" },
              { value: "staff", label: "Staff", icon: "grid" },
            ]}
          />
        </div>
        <div className={cn("flex-wrap items-center gap-2 px-3 py-2.5 sm:flex", showFilters ? "flex" : "hidden")}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search events, tasks, staff" label="Search the roster" className="w-full sm:w-64" />
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" className="w-full sm:w-48">
            <option value="">All events</option>
            {fortnight.events.map((v) => (
              <option key={v.event.id} value={v.event.id}>
                {v.event.name} · {formatDayMonth(v.event.date)}
              </option>
            ))}
          </Select>
          <Select value={staffName} onChange={(e) => setStaffName(e.target.value)} aria-label="Staff member" className="w-full sm:w-44">
            <option value="">All staff</option>
            {peopleOnRoster.map((s) => (
              <option key={s.staffName} value={s.staffName}>
                {s.staffName}
              </option>
            ))}
          </Select>
          <Select value={group} onChange={(e) => setGroup(e.target.value as GroupKey | "")} aria-label="Department" className="w-full sm:w-48">
            <option value="">All departments</option>
            {groupsPresent.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
          {filtering && (
            <Button
              size="sm"
              variant="ghost"
              icon="x"
              onClick={() => {
                setSearch("");
                setEventId("");
                setStaffName("");
                setGroup("");
                setRange("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        <dl className="grid grid-cols-2 border-t border-line text-sm sm:grid-cols-5">
          {[
            ["Events", String(fortnight.events.length), `${ahead.length} from today`],
            ["Positions filled", `${filled}/${needed}`, "today to end of fortnight"],
            ["Need attention", String(attention), attention ? "events with problems" : "nothing to fix"],
            ["Rostered hours", formatHours(fortnight.wages.totalHours), "after unpaid breaks"],
            ["Est. labour cost", money.format(fortnight.wages.totalPay), "award minimums"],
          ].map(([label, value, detail], i) => (
            <div
              key={label}
              className={cn("px-4 py-2.5", i > 0 && "border-l border-line", i === 2 && "max-sm:border-l-0", i >= 2 && "max-sm:border-t", i === 4 && "max-sm:col-span-2 max-sm:border-l-0")}
            >
              <dt className="text-xs text-muted">{label}</dt>
              <dd className={cn("font-semibold tabular-nums", label === "Need attention" && attention ? "text-warning" : "text-fg")}>
                {label === "Est. labour cost" ? (
                  <Link href={`/admin/reports?fortnight=${fortnightStart}&tab=wages`} className="hover:underline">
                    {value}
                  </Link>
                ) : (
                  value
                )}
                <span className="ml-1.5 text-xs font-normal text-muted">{detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {refreshing && <p className="mb-2 text-xs text-muted" role="status">Updating…</p>}

      {fortnight.events.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar"
            title="No events this fortnight"
            action={
              <>
                <ButtonLink variant="primary" icon="plus" href="/admin/events/new">
                  Create event
                </ButtonLink>
                {nextEvent && (
                  <ButtonLink href={nextEvent.href} iconRight="arrowRight">
                    Next: {nextEvent.name}, {formatWeekdayDate(nextEvent.date)}
                  </ButtonLink>
                )}
              </>
            }
          >
            Create an event, or move to the fortnight with your next one.
          </EmptyState>
        </Card>
      ) : view === "timeline" ? (
        <TimelineView views={filtered} shifts={shifts} days={days} today={today} onOpenTask={openTask} staffName={staffName} />
      ) : view === "staff" ? (
        <StaffGrid
          staff={staff}
          shifts={shifts}
          hours={fortnight.hours}
          days={days}
          today={today}
          staffName={staffName}
          search={search}
          eventIds={new Set(filtered.map((v) => v.event.id))}
          onOpenTask={openTask}
        />
      ) : dayGroups.length === 0 ? (
        <Card>
          <EmptyState icon="filter" title="Nothing matches these filters" compact>
            Try another period or clear the filters.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(filtered.map((v) => v.event.id)))}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
              Collapse all
            </Button>
          </div>
          <div className="space-y-6">
            {dayGroups.map((g) => (
              <section key={g.date} id={`day-${g.date}`} className="scroll-mt-20" aria-labelledby={`day-title-${g.date}`}>
                <h2 id={`day-title-${g.date}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  {formatWeekdayDate(g.date)}
                  {g.date === today && <span className="rounded bg-primary-soft px-1.5 text-xs font-medium text-primary-text">Today</span>}
                  {g.date < today && <span className="text-xs font-normal text-muted">Past</span>}
                </h2>
                <div className="space-y-3">
                  {g.items.map((v) => (
                    <EventRow
                      key={v.event.id}
                      view={v}
                      expanded={expanded.has(v.event.id)}
                      onToggle={() =>
                        setExpanded((all) => {
                          const next = new Set(all);
                          if (next.has(v.event.id)) next.delete(v.event.id);
                          else next.add(v.event.id);
                          return next;
                        })
                      }
                      onOpenTask={(taskId) => openTask(v.event.id, taskId)}
                      onEditTasks={() => setPanel({ kind: "tasks", eventId: v.event.id })}
                      filters={filters}
                      taskTypes={taskTypes}
                      today={today}
                      busy={busy}
                      onSaved={refresh}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {panel?.kind === "task" && panelView && panelTask && (
        <TaskDrawer
          key={`${panel.eventId}-${panel.taskId}`}
          view={panelView}
          status={panelTask}
          ctx={ctx}
          skills={skills}
          busy={refreshing}
          onSaved={refresh}
          onClose={closePanel}
        />
      )}
      {panel?.kind === "tasks" && panelView && (
        <TasksDrawer
          key={`tasks-${panel.eventId}`}
          view={panelView}
          taskTypes={taskTypes}
          skills={skills}
          templates={templates}
          busy={refreshing}
          onSaved={refresh}
          onClose={() => setPanel(null)}
        />
      )}
      {draft && (
        <GenerateReview
          proposals={draft.proposals}
          gaps={draft.gaps}
          onClose={() => setDraft(null)}
          onOpenTask={(e, t) => {
            setDraft(null);
            openTask(e, t);
          }}
          onApplied={({ applied, skipped }) => {
            setDraft(null);
            if (skipped.length) {
              toast.error(
                `Added ${applied}. Skipped ${skipped.length} because the roster changed since the draft: ${skipped
                  .map((s) => `${s.staffName} (${s.eventName}: ${s.reason})`)
                  .join("; ")}.`
              );
            } else {
              toast.success(`Added ${applied} assignment${applied === 1 ? "" : "s"}. Review any open positions, then publish.`);
            }
            refresh();
          }}
        />
      )}
    </>
  );
}
