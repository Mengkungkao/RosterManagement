"use client";

import { useState } from "react";
import { formatHours, formatMinutes, formatWeekdayDate } from "@/lib/dates";
import { EMPLOYMENT_LABELS, STUDENT_MAX_FORTNIGHT_HOURS, softFortnightLimit } from "@/lib/employment";
import type { RosterEntry } from "@/lib/events";
import type { EventView } from "@/lib/overview";
import {
  type Candidate,
  type EntryCheck,
  type RosterContext,
  type TaskStatus,
  type TimeWindow,
  explainOpenPlace,
  formatWindow,
  rankForTask,
  recommendation,
  sameName,
  windowHours,
} from "@/lib/roster";
import { RECORD_LEVEL_LABELS, type SkillDef, skillName } from "@/lib/skills";
import { GENERAL_TASK_ID } from "@/lib/tasks";
import { requirementBadges } from "../events/TaskEditor";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Checkbox, Input } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Drawer } from "../ui/Overlay";
import { Segmented } from "../ui/Segmented";
import { cn } from "../ui/cn";
import { useEventSaver } from "./useEventSaver";

function ReasonForm({
  prompt,
  onSave,
  onCancel,
  disabled,
  label = "Save reason",
}: {
  prompt: string;
  onSave: (reason: string) => void;
  onCancel: () => void;
  disabled: boolean;
  label?: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim()) onSave(reason.trim());
      }}
    >
      <Input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={prompt}
        maxLength={200}
        aria-label="Reason"
        className="min-w-48 flex-1"
      />
      <Button type="submit" variant="primary" size="sm" disabled={disabled || !reason.trim()}>
        {label}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function Problems({ check }: { check: Pick<EntryCheck, "problems" | "notes"> & { override?: string } }) {
  return (
    <>
      {check.problems.map((p) => (
        <p key={p.text} className={cn("mt-1 flex items-start gap-1.5 text-xs", p.overridable ? (check.override ? "text-muted" : "text-warning") : "text-danger")}>
          <Icon name={p.overridable ? (check.override ? "info" : "alert") : "xCircle"} size={13} className="mt-px" />
          <span>
            {p.text}
            {!p.overridable && " — can't be overridden"}
            {p.overridable && check.override && ` — rostered anyway: “${check.override}”`}
          </span>
        </p>
      ))}
      {check.notes.map((n) => (
        <p key={n} className="mt-1 flex items-start gap-1.5 text-xs text-muted">
          <Icon name="info" size={13} className="mt-px" />
          {n}
        </p>
      ))}
    </>
  );
}

function AssignedRow({
  check,
  type,
  disabled,
  replacing,
  onChange,
  onRemove,
  onReplace,
}: {
  check: EntryCheck;
  type: string;
  disabled: boolean;
  replacing: boolean;
  onChange: (entry: RosterEntry, success: string) => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const { entry, window } = check;
  const [editing, setEditing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [start, setStart] = useState(formatMinutes(window.start));
  const [end, setEnd] = useState(formatMinutes(window.end));
  const hard = check.problems.some((p) => !p.overridable);
  const soft = check.problems.some((p) => p.overridable);
  const counts = check.counts;

  return (
    <li className={cn("rounded-lg border px-3 py-2.5", replacing ? "border-primary bg-primary-soft" : "border-line")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg-2">
          {entry.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {entry.name}
            {entry.locked && <Icon name="lock" size={12} className="ml-1.5 inline text-muted" label="Locked" />}
          </p>
          <p className="text-xs text-muted">
            {type} ·{" "}
            <button type="button" onClick={() => setEditing(!editing)} disabled={disabled} className="tabular-nums underline-offset-2 hover:text-fg hover:underline">
              {formatWindow(window)} · {formatHours(windowHours(window))}
            </button>
          </p>
        </div>
        {!counts && (
          <Badge tone={hard ? "danger" : "warning"} icon={hard ? "xCircle" : "alert"}>
            Not counted
          </Badge>
        )}
        <div className="flex items-center">
          <IconButton
            icon={entry.locked ? "lock" : "unlock"}
            size="sm"
            label={entry.locked ? `Unlock ${entry.name} (Clear can take them off)` : `Lock ${entry.name} (Clear keeps them)`}
            aria-pressed={Boolean(entry.locked)}
            disabled={disabled}
            onClick={() => onChange({ ...entry, locked: !entry.locked }, entry.locked ? `Unlocked ${entry.name}.` : `Locked ${entry.name}.`)}
          />
          <IconButton icon="swap" size="sm" label={`Replace ${entry.name}`} disabled={disabled || entry.locked} onClick={onReplace} />
          <IconButton icon="pencil" size="sm" label={`Change ${entry.name}'s times`} disabled={disabled} onClick={() => setEditing(!editing)} />
          <IconButton
            icon="trash"
            size="sm"
            label={entry.locked ? `Unlock ${entry.name} first to remove them` : `Take ${entry.name} off this task`}
            disabled={disabled || entry.locked}
            onClick={onRemove}
          />
        </div>
      </div>
      <Problems check={{ ...check, override: entry.override }} />
      {soft && !hard && !entry.override && !accepting && (
        <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => setAccepting(true)}>
          Keep them on — give a reason
        </Button>
      )}
      {accepting && (
        <ReasonForm
          prompt="Why they can work it, e.g. confirmed by phone"
          disabled={disabled}
          onCancel={() => setAccepting(false)}
          onSave={(reason) => {
            onChange({ ...entry, override: reason }, `Kept ${entry.name} on, with your reason.`);
            setAccepting(false);
          }}
        />
      )}
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="time" aria-label="Starts" value={start} onChange={(e) => setStart(e.target.value)} className="w-32" />
          <span className="text-muted">to</span>
          <Input type="time" aria-label="Ends" value={end} onChange={(e) => setEnd(e.target.value)} className="w-32" />
          <Button
            size="sm"
            disabled={disabled || !start || !end || start === end}
            onClick={() => {
              onChange({ ...entry, startTime: start, endTime: end }, `Changed ${entry.name}'s times.`);
              setEditing(false);
            }}
          >
            Save times
          </Button>
          {(entry.startTime || entry.endTime) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                onChange({ ...entry, startTime: "", endTime: "" }, `${entry.name} now works the whole task.`);
                setEditing(false);
              }}
            >
              Use the task&apos;s times
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function CandidateRow({
  candidate,
  status,
  ctx,
  skills,
  date,
  disabled,
  verb,
  onAdd,
}: {
  candidate: Candidate;
  status: TaskStatus;
  ctx: RosterContext;
  skills: SkillDef[];
  date: string;
  disabled: boolean;
  verb: string;
  onAdd: (override?: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const { task } = status;
  const person = ctx.staff.find((s) => sameName(s.staffName, candidate.staffName));
  const eligible = candidate.problems.length === 0;
  const overridable = !eligible && candidate.problems.every((p) => p.overridable);
  const record = task.skillId ? person?.skills?.[task.skillId] : undefined;
  const limit = candidate.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(candidate.employmentType);

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">
            {candidate.staffName}
            <span className="ml-2 font-normal text-muted">{EMPLOYMENT_LABELS[candidate.employmentType]}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {task.skillId && (
              <Badge
                tone={record && record.level !== "not_yet" && (!record.expiresOn || record.expiresOn >= date) ? "info" : "neutral"}
                icon={false}
                title="Their record for this task's skill"
              >
                {skillName(skills, task.skillId).replace(/ \(.*\)$/, "")}:{" "}
                {record ? (record.expiresOn && record.expiresOn < date ? "check overdue" : RECORD_LEVEL_LABELS[record.level]) : "not verified"}
              </Badge>
            )}
            {task.qualificationIds.map((q) => {
              const held = person?.skills?.[q];
              const ok = held && (!held.expiresOn || held.expiresOn >= date);
              return (
                <Badge key={q} tone={ok ? "success" : "danger"} icon={ok ? "check" : "x"}>
                  {skillName(skills, q).replace(/ \(.*\)$/, "")}
                  {held?.expiresOn ? (ok ? ` to ${held.expiresOn}` : " expired") : ok ? "" : " missing"}
                </Badge>
              );
            })}
            <Badge
              tone={candidate.coverage === "full" ? "success" : candidate.coverage === "partial" ? "warning" : "neutral"}
              icon={candidate.coverage === "full" ? "check" : "clock"}
            >
              {candidate.coverage === "full" ? "Free whole shift" : candidate.free ? `Free ${formatWindow(candidate.free)}` : "Not available"}
            </Badge>
            <Badge tone="neutral" icon={false}>
              {formatHours(candidate.fortnightHours)}
              {limit !== null ? ` / ${limit}h` : ""} this fortnight
            </Badge>
          </div>
          {eligible && candidate.coverage === "full" && <p className="mt-1.5 text-xs text-fg-2">{recommendation(candidate)}</p>}
          <Problems check={candidate} />
        </div>
        {eligible ? (
          <Button size="sm" variant={verb === "Assign" ? "primary" : "secondary"} disabled={disabled} onClick={() => onAdd()}>
            {verb}
          </Button>
        ) : overridable ? (
          <Button size="sm" disabled={disabled} onClick={() => setAsking(!asking)} aria-expanded={asking}>
            {verb} anyway…
          </Button>
        ) : (
          <span className="pt-1 text-xs whitespace-nowrap text-muted">Can&apos;t be assigned</span>
        )}
      </div>
      {asking && (
        <ReasonForm
          prompt="Reason, e.g. trainee shadowing; agreed by phone"
          label={verb}
          disabled={disabled}
          onCancel={() => setAsking(false)}
          onSave={(reason) => {
            onAdd(reason);
            setAsking(false);
          }}
        />
      )}
    </li>
  );
}

// One task, focused: what it needs, who's on it, who could fill the gap and
// why — so a vacancy can be filled without leaving the roster.
export default function TaskDrawer({
  view,
  status,
  ctx,
  skills,
  busy,
  onSaved,
  onClose,
}: {
  view: EventView;
  status: TaskStatus;
  ctx: RosterContext;
  skills: SkillDef[];
  busy: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { event } = view;
  const { task } = status;
  const saver = useEventSaver(event, onSaved);
  const disabled = saver.saving || busy;
  const [partIndex, setPartIndex] = useState(() =>
    Math.max(0, status.parts.findIndex((p) => status.short.some((s) => s.start < p.end && p.start < s.end)))
  );
  const [replacing, setReplacing] = useState<RosterEntry | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  const target: TimeWindow = status.parts[Math.min(partIndex, status.parts.length - 1)] ?? status.window;
  const candidates = rankForTask(event, task, target, ctx);
  const eligible = candidates.filter((c) => c.problems.length === 0);
  const blocked = candidates.filter((c) => c.problems.length > 0);
  const shown = showAll ? eligible : eligible.slice(0, 5);
  const missing = Math.max(0, task.count - status.covered);
  const taskIssues = view.issues.filter((i) => i.taskId === task.id);
  const typeOf = (name: string) => {
    const person = ctx.staff.find((s) => sameName(s.staffName, name));
    return person ? EMPLOYMENT_LABELS[person.employmentType] : "Not on staff list";
  };

  const add = (c: Candidate, override?: string) => {
    const times = c.coverage === "partial" && c.free ? c.free : status.parts.length > 1 ? target : null;
    const entry: RosterEntry = {
      name: c.staffName,
      startTime: times ? formatMinutes(times.start) : "",
      endTime: times ? formatMinutes(times.end) : "",
      ...(task.id !== GENERAL_TASK_ID ? { taskId: task.id } : {}),
      ...(override ? { override } : {}),
    };
    const rest = replacing ? event.staff.filter((e) => e !== replacing) : event.staff;
    saver.saveStaff(
      [...rest, entry],
      replacing ? `Replaced ${replacing.name} with ${c.staffName} on ${task.name}.` : `Assigned ${c.staffName} to ${task.name}.`
    );
    setReplacing(null);
  };

  const verb = replacing ? "Swap in" : "Assign";

  return (
    <Drawer
      title={task.name}
      subtitle={
        <>
          {event.name} · {formatWeekdayDate(event.date)} · <span className="tabular-nums">{formatWindow(status.window)}</span>
        </>
      }
      onClose={onClose}
    >
      <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-line text-center">
        {[
          ["Required", task.count],
          ["Assigned", status.covered],
          ["Missing", missing],
        ].map(([label, value], i) => (
          <div key={label as string} className={cn("px-2 py-2.5", i > 0 && "border-l border-line")}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={cn("text-lg font-semibold tabular-nums", label === "Missing" && Number(value) > 0 ? "text-danger" : "text-fg")}>{value}</dd>
          </div>
        ))}
      </dl>
      {status.people > status.covered && (
        <p className="mt-2 text-xs text-muted">
          {status.people} {status.people === 1 ? "person is" : "people are"} on this task; {status.covered} count{status.covered === 1 ? "s" : ""} towards it
          (people who fail a check, or whose times leave a gap, don&apos;t).
        </p>
      )}

      {saver.error && (
        <Alert
          tone="danger"
          className="mt-4"
          role="alert"
          action={
            saver.error.conflict ? (
              <Button size="sm" onClick={onSaved}>
                Reload
              </Button>
            ) : undefined
          }
        >
          {saver.error.text}
        </Alert>
      )}

      <section className="mt-5">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Requirements</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {requirementBadges(task, skills).map((b) => (
            <Badge key={b.text} tone={b.tone}>
              {b.text}
            </Badge>
          ))}
          {requirementBadges(task, skills).length === 0 && <span className="text-sm text-muted">None — anyone available can do it.</span>}
          {task.skillId && !task.minLevel && (
            <p className="mt-1 w-full text-xs text-muted">Anyone available can do it; people experienced in it are suggested first.</p>
          )}
        </div>
        {task.notes && <p className="mt-2 text-sm text-fg-2">{task.notes}</p>}
        {task.controls && (
          <div className={cn("mt-3 rounded-lg border px-3 py-2.5", task.controlsConfirmed ? "border-line" : "border-warning-line bg-warning-soft")}>
            <Checkbox
              label={<span className="font-medium text-fg">Safety controls arranged: {task.controls}</span>}
              description={task.controlsConfirmed ? "Confirmed for this event." : "Generate roster won't fill this task until this is ticked."}
              checked={task.controlsConfirmed}
              disabled={disabled}
              onChange={(e) =>
                saver.saveDetails(
                  { tasks: event.tasks.map((t) => (t.id === task.id ? { ...t, controlsConfirmed: e.target.checked } : t)) },
                  e.target.checked ? `Confirmed safety controls for ${task.name}.` : `Safety controls for ${task.name} marked as not arranged.`
                )
              }
            />
          </div>
        )}
        {taskIssues.filter((i) => i.severity === "warning" && !i.staffName).map((i) => (
          <Alert key={i.text} tone="warning" className="mt-2">
            {i.text}
          </Alert>
        ))}
      </section>

      <section className="mt-6">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">
          Assigned <span className="tabular-nums">({status.entries.length})</span>
        </h3>
        {status.entries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No one yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {status.entries.map((check) => (
              <AssignedRow
                key={`${check.entry.name}-${check.entry.startTime}-${check.entry.endTime}`}
                check={check}
                type={typeOf(check.entry.name)}
                disabled={disabled}
                replacing={replacing === check.entry}
                onReplace={() => setReplacing(replacing === check.entry ? null : check.entry)}
                onChange={(changed, success) => saver.saveStaff(event.staff.map((e) => (e === check.entry ? changed : e)), success)}
                onRemove={() => saver.saveStaff(event.staff.filter((e) => e !== check.entry), `Took ${check.entry.name} off ${task.name}.`)}
              />
            ))}
          </ul>
        )}
      </section>

      {(missing > 0 || replacing || status.unsafe.length > 0) && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted uppercase">
              {replacing ? `Replace ${replacing.name} with` : "Suggested staff"}
            </h3>
            {replacing && (
              <Button size="sm" variant="ghost" onClick={() => setReplacing(null)}>
                Cancel replace
              </Button>
            )}
          </div>
          {status.parts.length > 1 && (
            <div className="mt-2">
              <Segmented
                label="Part of the shift"
                size="sm"
                value={String(partIndex)}
                onChange={(v) => setPartIndex(Number(v))}
                options={status.parts.map((p, i) => ({
                  value: String(i),
                  label: `${i === 0 ? "Early" : i === status.parts.length - 1 ? "Late" : "Middle"} ${formatWindow(p)}`,
                }))}
              />
              <p className="mt-1 text-xs text-muted">Longer than one person may work (12h), so it&apos;s rostered in parts.</p>
            </div>
          )}
          {eligible.length === 0 ? (
            <WhyOpen view={view} status={status} target={target} ctx={ctx} />
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {shown.map((c) => (
                <CandidateRow key={c.staffName} candidate={c} status={status} ctx={ctx} skills={skills} date={event.date} disabled={disabled} verb={verb} onAdd={(o) => add(c, o)} />
              ))}
            </ul>
          )}
          {eligible.length > shown.length && (
            <Button variant="link" size="sm" onClick={() => setShowAll(true)}>
              Show all {eligible.length} who can work it
            </Button>
          )}
          {blocked.length > 0 && (
            <div className="mt-3 rounded-lg border border-line">
              <button
                type="button"
                onClick={() => setShowBlocked(!showBlocked)}
                aria-expanded={showBlocked}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg-2 hover:bg-surface-2"
              >
                <Icon name={showBlocked ? "chevronDown" : "chevronRight"} size={15} className="text-muted" />
                Not eligible <span className="text-muted tabular-nums">({blocked.length})</span>
                <span className="ml-auto text-xs text-muted">with the reason</span>
              </button>
              {showBlocked && (
                <ul className="divide-y divide-line border-t border-line px-3">
                  {blocked.map((c) => (
                    <CandidateRow key={c.staffName} candidate={c} status={status} ctx={ctx} skills={skills} date={event.date} disabled={disabled} verb={verb} onAdd={(o) => add(c, o)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </Drawer>
  );
}

function WhyOpen({ view, status, target, ctx }: { view: EventView; status: TaskStatus; target: TimeWindow; ctx: RosterContext }) {
  const reasons = explainOpenPlace(view.event, status.task, target, ctx);
  return (
    <Alert tone="warning" title="Why is this position open?" className="mt-2">
      {reasons.length === 0 ? (
        "There's no one else on the staff list to choose from."
      ) : (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {reasons.map((r) => (
            <li key={r.code}>
              {r.count} {r.count === 1 ? "person" : "people"}: {r.label}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
