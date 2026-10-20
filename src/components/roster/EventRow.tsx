"use client";

import { useState } from "react";
import { formatHours } from "@/lib/dates";
import { type EventView, rosterStatus } from "@/lib/overview";
import { type TaskStatus, eventWindow, formatWindow, sameName } from "@/lib/roster";
import type { TaskType } from "@/lib/tasks";
import { Alert } from "../ui/Alert";
import { Badge, CoverageBadge } from "../ui/Badge";
import { Button, ButtonLink } from "../ui/Button";
import { Checkbox } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Progress } from "../ui/Progress";
import { cn } from "../ui/cn";
import { type Filters, GROUP_LABELS, GROUP_ORDER, groupOf, money, visibleTasks } from "./model";
import { StatusBadge } from "./StatusBadge";
import { useEventSaver } from "./useEventSaver";

function TaskLine({ status, onOpen, highlight }: { status: TaskStatus; onOpen: () => void; highlight: string }) {
  const { task } = status;
  const missing = Math.max(0, task.count - status.covered);
  const problems = status.entries.filter((c) => !c.counts).length;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_auto_auto]"
      >
        <span className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
          <span className="block truncate text-sm font-medium text-fg">{task.name}</span>
          <span className="block text-xs text-muted tabular-nums">
            {formatWindow(status.window)}
            {task.minTeam > 1 && ` · team of ${task.minTeam}`}
            {task.qualificationIds.length > 0 && " · qualification needed"}
          </span>
        </span>
        <span className="col-span-2 row-start-2 flex min-w-0 flex-wrap gap-1 sm:col-span-1 sm:row-start-auto">
          {status.entries.length === 0 ? (
            <span className="text-xs text-subtle">No one assigned</span>
          ) : (
            status.entries.map((c) => (
              <span
                key={`${c.entry.name}-${c.entry.startTime}`}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs",
                  !c.counts
                    ? "border-danger-line bg-danger-soft text-danger"
                    : highlight && sameName(c.entry.name, highlight)
                      ? "border-primary bg-primary-soft text-primary-text"
                      : "border-line bg-surface-2 text-fg-2"
                )}
                title={c.problems.map((p) => p.text).join("; ") || undefined}
              >
                {!c.counts && <Icon name="alert" size={11} />}
                {c.entry.locked && <Icon name="lock" size={11} />}
                {c.entry.name}
                {c.entry.startTime && <span className="text-muted tabular-nums">{c.entry.startTime}–{c.entry.endTime}</span>}
              </span>
            ))
          )}
        </span>
        <span className="col-start-2 row-start-1 flex items-center gap-1.5 justify-self-end sm:col-start-auto sm:row-start-auto">
          {status.needsControls && <Badge tone="warning" icon="shield">Controls</Badge>}
          {problems > 0 && (
            <Badge tone="danger" icon="alert">
              {problems} issue{problems === 1 ? "" : "s"}
            </Badge>
          )}
          <CoverageBadge filled={status.covered} needed={task.count} unsafe={status.unsafe.length > 0} />
        </span>
        <span className="hidden items-center gap-1 text-[13px] font-medium text-primary-text sm:flex">
          {missing > 0 ? `Fill ${missing}` : "Manage"}
          <Icon name="chevronRight" size={14} />
        </span>
      </button>
    </li>
  );
}

export default function EventRow({
  view,
  expanded,
  onToggle,
  onOpenTask,
  onEditTasks,
  filters,
  taskTypes,
  today,
  busy,
  onSaved,
}: {
  view: EventView;
  expanded: boolean;
  onToggle: () => void;
  onOpenTask: (taskId: string) => void;
  onEditTasks: () => void;
  filters: Filters;
  taskTypes: TaskType[];
  today: string;
  busy: boolean;
  onSaved: () => void;
}) {
  const { event, staffing } = view;
  const status = rosterStatus(view);
  const saver = useEventSaver(event, onSaved);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const ev = eventWindow(event);
  const warnings = view.issues.filter((i) => i.severity === "warning");
  const notes = view.issues.filter((i) => i.severity === "info");
  const tasks = visibleTasks(view, filters, taskTypes);
  const groups = GROUP_ORDER.map((g) => ({ key: g, items: tasks.filter((s) => groupOf(s, taskTypes) === g) })).filter((g) => g.items.length);
  const disabled = busy || saver.saving;
  const past = event.date < today;
  const bodyId = `event-${event.id}`;

  return (
    <article id={`row-${event.id}`} className={cn("scroll-mt-20 rounded-lg border bg-surface shadow-card", status.key === "attention" ? "border-warning-line" : "border-line", past && "opacity-80")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-left"
      >
        <Icon name={expanded ? "chevronDown" : "chevronRight"} size={16} className="mt-0.5 text-muted" />
        <span className="min-w-0 flex-1 basis-60">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-fg">{event.name}</span>
            <StatusBadge status={status} />
            {status.key === "attention" && event.status === "draft" && <Badge icon="circleDashed">Draft</Badge>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon name="clock" size={13} />
              {event.startTime}–{event.endTime}
            </span>
            {(view.span.start < ev.start || view.span.end > ev.end) && (
              <span className="tabular-nums">
                {view.span.start < ev.start && `Setup from ${formatWindow(view.span).slice(0, 5)}`}
                {view.span.start < ev.start && view.span.end > ev.end && " · "}
                {view.span.end > ev.end && `Pack-down to ${formatWindow(view.span).slice(-5)}`}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <Icon name="mapPin" size={13} />
                {event.location}
              </span>
            )}
            {event.guests ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="users" size={13} />
                {event.guests} guests
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex items-center gap-4 pl-7 sm:pl-0">
          {warnings.length > 0 && (
            <Badge tone="warning" icon="alert">
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </Badge>
          )}
          <span className="w-36">
            <span className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-fg tabular-nums">
                {staffing.filled}/{staffing.needed}
              </span>
              <span className="text-muted">positions</span>
            </span>
            <Progress value={staffing.filled} max={staffing.needed} label={`${staffing.filled} of ${staffing.needed} positions filled`} className="mt-1" />
          </span>
          <span className="hidden w-24 text-right text-xs text-muted md:block">
            <span className="block font-medium text-fg tabular-nums">{formatHours(view.hours > 0 ? view.hours : view.plannedHours)}</span>
            {view.hours > 0 ? "rostered" : "planned"}
          </span>
        </span>
      </button>

      {expanded && (
        <div id={bodyId} className="border-t border-line">
          {saver.error && (
            <Alert tone="danger" className="mx-4 mt-3" role="alert" action={saver.error.conflict ? <Button size="sm" onClick={onSaved}>Reload</Button> : undefined}>
              {saver.error.text}
            </Alert>
          )}
          {warnings.length > 0 && (
            <div className="mx-4 mt-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[13px] text-fg-2">
              <ul className="space-y-1">
                {(showAllIssues ? warnings : warnings.slice(0, 3)).map((i) => (
                  <li key={i.text} className="flex items-start gap-1.5">
                    <Icon name="alert" size={13} className="mt-0.5 text-warning" />
                    {i.taskId ? (
                      <button type="button" className="text-left hover:underline" onClick={() => onOpenTask(i.taskId!)}>
                        {i.text}
                      </button>
                    ) : (
                      <span>{i.text}</span>
                    )}
                  </li>
                ))}
              </ul>
              {warnings.length > 3 && (
                <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => setShowAllIssues(!showAllIssues)}>
                  {showAllIssues ? "Show fewer" : `Show all ${warnings.length}`}
                </Button>
              )}
            </div>
          )}
          {notes.length > 0 && (
            <ul className="mx-4 mt-2 space-y-0.5 text-xs text-muted">
              {notes.map((n) => (
                <li key={n.text} className="flex items-start gap-1.5">
                  <Icon name="info" size={12} className="mt-0.5" />
                  {n.text}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className="bg-surface-2 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{GROUP_LABELS[g.key]}</h3>
                <ul className="divide-y divide-line">
                  {g.items.map((s) => (
                    <TaskLine key={s.task.id} status={s} onOpen={() => onOpenTask(s.task.id)} highlight={filters.staffName} />
                  ))}
                </ul>
              </section>
            ))}
            {groups.length === 0 && <p className="px-4 py-3 text-sm text-muted">No tasks match the filters.</p>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
            {event.status === "draft" ? (
              <Button variant="primary" size="sm" icon="send" disabled={disabled} onClick={() => saver.saveDetails({ status: "published" }, `Published ${event.name}. Staff can now see their shifts.`)}>
                Publish to staff
              </Button>
            ) : (
              <Button size="sm" disabled={disabled} onClick={() => saver.saveDetails({ status: "draft" }, `${event.name} is a draft again — staff can't see it.`)}>
                Back to draft
              </Button>
            )}
            <Button size="sm" icon="list" disabled={disabled} onClick={onEditTasks}>
              Edit tasks
            </Button>
            <ButtonLink size="sm" variant="ghost" icon="pencil" href={`/admin/events/${encodeURIComponent(event.id)}`}>
              Edit event
            </ButtonLink>
            <Checkbox
              className="text-[13px]"
              label="Staff can also work other functions at the same time"
              checked={event.shareStaff}
              disabled={disabled}
              onChange={(e) =>
                saver.saveDetails(
                  { shareStaff: e.target.checked },
                  e.target.checked ? `${event.name} can now share staff with other functions.` : `${event.name} no longer shares staff.`
                )
              }
            />
            <span className="ml-auto text-xs text-muted tabular-nums">
              {staffing.people} {staffing.people === 1 ? "person" : "people"} · {formatHours(view.hours)} rostered
              {view.hours > 0 && ` · ≈ ${money.format(view.cost)}`}
              {view.missingLevels.length > 0 && ` (+${view.missingLevels.length} without award level)`}
            </span>
          </div>
          {(event.actions.length > 0 || event.notes) && (
            <details className="border-t border-line px-4 py-2.5 text-[13px]">
              <summary className="cursor-pointer text-muted hover:text-fg">Run of show and notes</summary>
              {event.actions.length > 0 && (
                <ol className="mt-2 space-y-0.5 text-fg-2">
                  {event.actions.map((a, i) => (
                    <li key={i}>
                      <span className="inline-block w-12 text-muted tabular-nums">{a.time || event.startTime}</span>
                      {a.label}
                    </li>
                  ))}
                </ol>
              )}
              {event.notes && <p className="mt-2 whitespace-pre-wrap text-fg-2">{event.notes}</p>}
            </details>
          )}
        </div>
      )}
    </article>
  );
}
