"use client";

import { useState } from "react";
import Link from "next/link";
import { formatHours, formatMinutes, formatWeekdayDate } from "@/lib/dates";
import { EMPLOYMENT_LABELS } from "@/lib/employment";
import type { EventInput, EventRecord, RosterEntry } from "@/lib/events";
import type { EventView } from "@/lib/overview";
import {
  type Candidate,
  type EntryCheck,
  type RosterContext,
  type TaskStatus,
  type TimeWindow,
  eventWindow,
  explainOpenPlace,
  formatWindow,
  rankForTask,
  recommendation,
  sameName,
  shiftWindow,
  windowHours,
} from "@/lib/roster";
import type { SkillDef } from "@/lib/skills";
import { type EventTask, type TaskType, GENERAL_TASK_ID } from "@/lib/tasks";
import type { EventTemplate } from "@/lib/templates";
import {
  chip,
  errorBox,
  errorText,
  infoBox,
  input,
  linkButton,
  mutedText,
  primaryButton,
  secondaryButton,
  tones,
  warningBox,
  warningText,
} from "../ui";
import { send } from "./api";
import Modal from "./Modal";
import StaffingPill from "./StaffingPill";
import TaskEditor, { requirementBadges } from "./TaskEditor";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

interface Props {
  view: EventView;
  ctx: RosterContext;
  skills: SkillDef[];
  taskTypes: TaskType[];
  templates: EventTemplate[];
  busy: boolean;
  onSaved: () => void;
  onClose: () => void;
}

export function detailsOf(event: EventRecord): EventInput {
  const { id: _id, staff: _staff, rev: _rev, ...details } = event;
  return details;
}

function ReasonForm({
  prompt,
  onSave,
  onCancel,
  disabled,
}: {
  prompt: string;
  onSave: (reason: string) => void;
  onCancel: () => void;
  disabled: boolean;
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
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={prompt}
        maxLength={200}
        className={`min-w-48 flex-1 ${input}`}
        aria-label="Reason"
      />
      <button type="submit" disabled={disabled || !reason.trim()} className={`${primaryButton} py-1.5`}>
        Save reason
      </button>
      <button type="button" onClick={onCancel} className={linkButton}>
        Cancel
      </button>
    </form>
  );
}

function EntryRow({
  check,
  type,
  disabled,
  onChange,
  onRemove,
  onReplace,
  replacing,
}: {
  check: EntryCheck;
  type: string;
  disabled: boolean;
  onChange: (entry: RosterEntry) => void;
  onRemove: () => void;
  onReplace: () => void;
  replacing: boolean;
}) {
  const { entry, window } = check;
  const [editing, setEditing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [start, setStart] = useState(formatMinutes(window.start));
  const [end, setEnd] = useState(formatMinutes(window.end));
  const hard = check.problems.filter((p) => !p.overridable);
  const soft = check.problems.filter((p) => p.overridable);

  return (
    <li className={`py-2.5 ${replacing ? "bg-sky-50 dark:bg-sky-950/30" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.name}</span>
          <span className={`ml-2 text-xs ${mutedText}`}>{type}</span>
          {entry.locked && <span className={`ml-2 ${chip} ${tones.neutral}`}>🔒 Locked</span>}
        </div>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          disabled={disabled}
          className="text-sm text-zinc-700 tabular-nums underline-offset-2 hover:underline dark:text-zinc-300"
          title="Change this person's times"
        >
          {formatWindow(window)} · {formatHours(windowHours(window))}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...entry, locked: !entry.locked })}
          className={`${linkButton} text-xs`}
          aria-pressed={Boolean(entry.locked)}
          title={entry.locked ? "Unlock: Clear can take them off" : "Lock: Clear keeps them"}
        >
          {entry.locked ? "Unlock" : "Lock"}
        </button>
        <button type="button" disabled={disabled || entry.locked} onClick={onReplace} className={`${linkButton} text-xs`}>
          {replacing ? "Choose below…" : "Replace"}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || entry.locked}
          title={entry.locked ? "Unlock first" : `Take ${entry.name} off`}
          className="rounded px-1.5 text-zinc-400 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
          aria-label={`Take ${entry.name} off this task`}
        >
          ✕
        </button>
      </div>
      {!check.onStaffList && <p className={`text-xs ${warningText}`}>⚠ Not on the staff list</p>}
      {hard.map((p) => (
        <p key={p.text} className={`text-xs ${errorText}`}>
          ✕ {p.text} — doesn&apos;t count towards this task
        </p>
      ))}
      {soft.map((p) => (
        <p key={p.text} className={`text-xs ${entry.override ? mutedText : warningText}`}>
          {entry.override ? "ℹ" : "⚠"} {p.text}
          {entry.override ? ` — rostered anyway: “${entry.override}”` : " — not counted until you give a reason"}
        </p>
      ))}
      {check.notes.map((n) => (
        <p key={n} className={`text-xs ${mutedText}`}>
          ℹ {n}
        </p>
      ))}
      {soft.length > 0 && hard.length === 0 && !entry.override && !accepting && (
        <button type="button" onClick={() => setAccepting(true)} className={`${linkButton} text-xs`}>
          Keep them on — give a reason
        </button>
      )}
      {accepting && (
        <ReasonForm
          prompt="Why they can work it, e.g. confirmed by phone"
          disabled={disabled}
          onCancel={() => setAccepting(false)}
          onSave={(reason) => {
            onChange({ ...entry, override: reason });
            setAccepting(false);
          }}
        />
      )}
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="time" aria-label="Starts" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
          <span className={mutedText}>to</span>
          <input type="time" aria-label="Ends" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
          <button
            type="button"
            disabled={disabled || !start || !end || start === end}
            onClick={() => {
              onChange({ ...entry, startTime: start, endTime: end });
              setEditing(false);
            }}
            className={secondaryButton}
          >
            Save times
          </button>
          {(entry.startTime || entry.endTime) && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange({ ...entry, startTime: "", endTime: "" });
                setEditing(false);
              }}
              className={linkButton}
            >
              Use the task&apos;s times
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CandidateRow({
  candidate,
  disabled,
  onAdd,
  replacing,
}: {
  candidate: Candidate;
  disabled: boolean;
  onAdd: (override?: string) => void;
  replacing: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const blocked = candidate.problems.length > 0;
  const overridable = blocked && candidate.problems.every((p) => p.overridable);
  const verb = replacing ? `Swap in` : "Add";
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{candidate.staffName}</span>
            <span className={`ml-2 text-xs ${mutedText}`}>
              {EMPLOYMENT_LABELS[candidate.employmentType]} · {formatHours(candidate.fortnightHours)} this fortnight
            </span>
          </div>
          {!blocked && candidate.coverage === "full" && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ {recommendation(candidate)}</p>
          )}
          {candidate.problems.map((p) => (
            <p key={p.text} className={`text-xs ${p.overridable ? warningText : errorText}`}>
              {p.overridable ? "⚠" : "✕"} {p.text}
            </p>
          ))}
          {candidate.notes.map((n) => (
            <p key={n} className={`text-xs ${mutedText}`}>
              ℹ {n}
            </p>
          ))}
        </div>
        {!blocked ? (
          <button type="button" onClick={() => onAdd()} disabled={disabled} className={`${secondaryButton} py-1`}>
            {verb}
          </button>
        ) : overridable ? (
          <button type="button" onClick={() => setAsking(!asking)} disabled={disabled} className={`${secondaryButton} py-1`}>
            {verb} anyway…
          </button>
        ) : (
          <span className={`pt-1 text-xs ${mutedText}`}>Can&apos;t be rostered</span>
        )}
      </div>
      {asking && (
        <ReasonForm
          prompt="Reason, e.g. trainee shadowing; agreed by phone"
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

function TaskBlock({
  status,
  event,
  ctx,
  skills,
  open,
  onToggle,
  disabled,
  typeOf,
  saveStaff,
  saveTask,
}: {
  status: TaskStatus;
  event: EventRecord;
  ctx: RosterContext;
  skills: SkillDef[];
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
  typeOf: (name: string) => string;
  saveStaff: (entries: RosterEntry[]) => void;
  saveTask: (change: Partial<EventTask>) => void;
}) {
  const { task } = status;
  const [partIndex, setPartIndex] = useState(() => {
    const i = status.parts.findIndex((p) => status.short.some((s) => s.start < p.end && p.start < s.end));
    return Math.max(0, i);
  });
  const [showAll, setShowAll] = useState(false);
  const [replacing, setReplacing] = useState<RosterEntry | null>(null);
  const target: TimeWindow = status.parts[Math.min(partIndex, status.parts.length - 1)] ?? status.window;
  const candidates = open ? rankForTask(event, task, target, ctx) : [];
  const ready = candidates.filter((c) => c.problems.length === 0);
  const blocked = candidates.filter((c) => c.problems.length > 0);
  const shownReady = showAll ? ready : ready.slice(0, 6);
  const shortHere = status.covered < task.count;
  const unsafe = status.unsafe.length > 0;

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
    saveStaff([...rest, entry]);
    setReplacing(null);
  };

  return (
    <li className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{task.name}</span>
          <span className={`ml-2 text-sm tabular-nums ${mutedText}`}>{formatWindow(status.window)}</span>
        </span>
        {status.needsControls && <span className={`${chip} ${tones.warn}`}>! Confirm controls</span>}
        <StaffingPill filled={status.covered} needed={task.count} unsafe={unsafe} label="" />
        <span aria-hidden="true" className={mutedText}>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-100 px-3 pt-2 pb-3 dark:border-zinc-900">
          <div className="flex flex-wrap gap-1.5">
            {requirementBadges(task, skills).map((b) => (
              <span key={b.text} className={`${chip} ${tones[b.tone]}`}>
                {b.text}
              </span>
            ))}
          </div>
          {task.notes && <p className={`mt-2 text-sm ${mutedText}`}>{task.notes}</p>}
          {task.controls && (
            <label className={`mt-2 flex items-start gap-2 text-sm ${task.controlsConfirmed ? "" : warningText}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                disabled={disabled}
                checked={task.controlsConfirmed}
                onChange={(e) => saveTask({ controlsConfirmed: e.target.checked })}
              />
              <span>
                Safety controls arranged: {task.controls}
                {!task.controlsConfirmed && (
                  <span className={`block text-xs ${mutedText}`}>Generate won&apos;t fill this task until this is ticked.</span>
                )}
              </span>
            </label>
          )}
          {unsafe && (
            <p className={`mt-2 text-sm ${errorText}`}>
              ✕ Team work: needs {task.minTeam} people on together — not enough at {status.unsafe.map(formatWindow).join(", ")}
            </p>
          )}

          {status.entries.length > 0 && (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
              {status.entries.map((check) => (
                <EntryRow
                  key={`${check.entry.name}-${check.entry.startTime}-${check.entry.endTime}`}
                  check={check}
                  type={typeOf(check.entry.name)}
                  disabled={disabled}
                  replacing={replacing === check.entry}
                  onReplace={() => setReplacing(replacing === check.entry ? null : check.entry)}
                  onChange={(changed) => saveStaff(event.staff.map((e) => (e === check.entry ? changed : e)))}
                  onRemove={() => saveStaff(event.staff.filter((e) => e !== check.entry))}
                />
              ))}
            </ul>
          )}

          {(shortHere || replacing) && (
            <div className="mt-3">
              {status.parts.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Part of the shift">
                  {status.parts.map((part, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPartIndex(i)}
                      aria-pressed={i === partIndex}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums ${
                        i === partIndex
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400"
                      }`}
                    >
                      {i === 0 ? "Early" : i === status.parts.length - 1 ? "Late" : "Middle"} {formatWindow(part)}
                    </button>
                  ))}
                  <span className={`self-center text-xs ${mutedText}`}>Longer than one person may work (12h), so rostered in parts.</span>
                </div>
              )}
              <h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {replacing ? `Replace ${replacing.name} with…` : "Add people"}{" "}
                <span className={`font-normal ${mutedText}`}>· best fit first</span>
              </h4>
              {ready.length === 0 ? (
                <WhyOpen event={event} task={task} target={target} ctx={ctx} />
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
                  {shownReady.map((c) => (
                    <CandidateRow key={c.staffName} candidate={c} disabled={disabled} replacing={replacing?.name ?? null} onAdd={(o) => add(c, o)} />
                  ))}
                </ul>
              )}
              {ready.length > shownReady.length && (
                <button type="button" onClick={() => setShowAll(true)} className={`${linkButton} mt-1 text-xs`}>
                  Show all {ready.length} who can work it
                </button>
              )}
              {blocked.length > 0 && (
                <details className="mt-2">
                  <summary className={`cursor-pointer text-sm ${mutedText}`}>
                    Can&apos;t be added automatically ({blocked.length}) — see why
                  </summary>
                  <ul className="mt-1 divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
                    {blocked.map((c) => (
                      <CandidateRow key={c.staffName} candidate={c} disabled={disabled} replacing={replacing?.name ?? null} onAdd={(o) => add(c, o)} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function WhyOpen({ event, task, target, ctx }: { event: EventRecord; task: EventTask; target: TimeWindow; ctx: RosterContext }) {
  const reasons = explainOpenPlace(event, task, target, ctx);
  return (
    <div className={`mt-1 ${warningBox}`}>
      <p className="font-medium">Why is this position open?</p>
      {reasons.length === 0 ? (
        <p className="mt-0.5">There&apos;s no one else on the staff list to choose from.</p>
      ) : (
        <ul className="mt-0.5 list-disc pl-5">
          {reasons.map((r) => (
            <li key={r.code}>
              {r.count} {r.count === 1 ? "person" : "people"}: {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EventPanel({ view, ctx, skills, taskTypes, templates, busy, onSaved, onClose }: Props) {
  const { event, statuses, staffing, issues } = view;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(
    () => statuses.find((s) => s.task.mandatory && !s.filled)?.task.id ?? (statuses.length === 1 ? statuses[0].task.id : null)
  );
  const [editingTasks, setEditingTasks] = useState<EventTask[] | null>(null);
  const disabled = saving || busy;

  const typeOf = (name: string) => {
    const person = ctx.staff.find((s) => sameName(s.staffName, name));
    return person ? EMPLOYMENT_LABELS[person.employmentType] : "Not on staff list";
  };

  async function save(url: string, body: unknown): Promise<boolean> {
    setSaving(true);
    setError(null);
    const result = await send(url, "PUT", body);
    setSaving(false);
    if (!result.ok) {
      setError({ text: result.error, conflict: result.status === 409 });
      return false;
    }
    onSaved();
    return true;
  }

  const saveStaff = (entries: RosterEntry[]) =>
    save(`/api/admin/events/${encodeURIComponent(event.id)}/staff`, { staff: entries, rev: event.rev });

  const saveDetails = (changes: Partial<EventInput>) =>
    save(`/api/admin/events/${encodeURIComponent(event.id)}`, { ...detailsOf(event), ...changes, rev: event.rev });

  const ev = eventWindow(event);
  const shift = shiftWindow(event);
  const peopleOn = Object.fromEntries(statuses.map((s) => [s.task.id, s.entries.length]));
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const tasksForEditing = event.tasks.length ? event.tasks : statuses.map((s) => s.task);

  return (
    <Modal
      title={
        <span className="flex flex-wrap items-center gap-2">
          {event.name}
          {event.status === "draft" ? (
            <span className={`${chip} ${tones.neutral}`}>Draft — staff can&apos;t see it</span>
          ) : (
            <span className={`${chip} ${tones.good}`}>✓ Published</span>
          )}
        </span>
      }
      subtitle={
        <>
          {formatWeekdayDate(event.date)} · {event.startTime}–{event.endTime}
          {event.location && ` · ${event.location}`}
        </>
      }
      onClose={onClose}
      wide
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <StaffingPill filled={staffing.filled} needed={staffing.needed} label="positions" />
        <span className={mutedText}>
          {staffing.people} {staffing.people === 1 ? "person" : "people"} · {formatHours(view.hours)} rostered
          {view.hours > 0 && ` · ≈ ${money.format(view.cost)}`}
          {view.missingLevels.length > 0 && ` (+${view.missingLevels.length} without award level)`}
        </span>
        {(saving || busy) && <span className={mutedText}>Saving…</span>}
        <span className="ml-auto flex flex-wrap gap-2">
          {event.status === "draft" ? (
            <button type="button" disabled={disabled} onClick={() => saveDetails({ status: "published" })} className={primaryButton}>
              Publish to staff
            </button>
          ) : (
            <button type="button" disabled={disabled} onClick={() => saveDetails({ status: "draft" })} className={secondaryButton}>
              Back to draft
            </button>
          )}
          <Link href={`/admin/events?edit=${encodeURIComponent(event.id)}`} className={secondaryButton}>
            Edit event
          </Link>
        </span>
      </div>

      <dl className={`mt-3 grid grid-cols-3 gap-2 text-xs ${mutedText}`}>
        <div className={`${infoBox} p-2`}>
          <dt>Setup</dt>
          <dd className="font-medium text-zinc-800 tabular-nums dark:text-zinc-200">
            {view.span.start < ev.start ? formatWindow({ start: view.span.start, end: ev.start }) : "—"}
          </dd>
        </div>
        <div className={`${infoBox} p-2`}>
          <dt>Event</dt>
          <dd className="font-medium text-zinc-800 tabular-nums dark:text-zinc-200">{formatWindow(ev)}</dd>
        </div>
        <div className={`${infoBox} p-2`}>
          <dt>Pack-down</dt>
          <dd className="font-medium text-zinc-800 tabular-nums dark:text-zinc-200">
            {view.span.end > ev.end ? formatWindow({ start: ev.end, end: view.span.end }) : "—"}
          </dd>
        </div>
      </dl>
      {event.tasks.length === 0 && (
        <p className={`mt-2 text-xs ${mutedText}`}>
          General staff work {formatWindow(shift)} (setup {formatHours(event.setupHours)}, pack-down {formatHours(event.packDownHours)}).
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={event.shareStaff}
          disabled={disabled}
          onChange={(e) => saveDetails({ shareStaff: e.target.checked })}
          className="h-4 w-4"
        />
        Staff can also work other functions at the same time
      </label>

      {error && (
        <div className={`mt-3 ${errorBox}`}>
          {error.text}
          {error.conflict && (
            <button type="button" onClick={onSaved} className={`ml-2 underline`}>
              Reload
            </button>
          )}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className={`mt-3 space-y-0.5 ${warningBox}`}>
          {warnings.map((issue) => (
            <li key={issue.text}>⚠ {issue.text}</li>
          ))}
        </ul>
      )}
      {infos.length > 0 && (
        <ul className={`mt-2 space-y-0.5 ${infoBox}`}>
          {infos.map((issue) => (
            <li key={issue.text}>ℹ {issue.text}</li>
          ))}
        </ul>
      )}

      <section className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Tasks</h3>
          {editingTasks === null ? (
            <button type="button" disabled={disabled} onClick={() => setEditingTasks(tasksForEditing)} className={linkButton}>
              Edit tasks, headcounts and times
            </button>
          ) : null}
        </div>
        {editingTasks !== null ? (
          <div className="mt-2">
            <TaskEditor
              tasks={editingTasks}
              onChange={setEditingTasks}
              taskTypes={taskTypes}
              skills={skills}
              templates={templates}
              times={{ start: ev.start, end: ev.end, setupMinutes: event.setupHours * 60, packDownMinutes: event.packDownHours * 60 }}
              peopleOn={peopleOn}
              disabled={disabled}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={async () => {
                  if (await saveDetails({ tasks: editingTasks })) setEditingTasks(null);
                }}
                className={primaryButton}
              >
                {saving ? "Saving…" : "Save tasks"}
              </button>
              <button type="button" onClick={() => setEditingTasks(null)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {statuses.map((status) => (
              <TaskBlock
                key={status.task.id}
                status={status}
                event={event}
                ctx={ctx}
                skills={skills}
                open={openTask === status.task.id}
                onToggle={() => setOpenTask(openTask === status.task.id ? null : status.task.id)}
                disabled={disabled}
                typeOf={typeOf}
                saveStaff={saveStaff}
                saveTask={(change) =>
                  saveDetails({ tasks: tasksForEditing.map((t) => (t.id === status.task.id ? { ...t, ...change } : t)) })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {event.actions.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Run of show</h3>
          <ul className={`mt-1 space-y-0.5 text-sm ${mutedText}`}>
            {event.actions.map((a, i) => (
              <li key={i}>
                <span className="tabular-nums">{a.time || event.startTime}</span> {a.label}
              </li>
            ))}
          </ul>
        </section>
      )}
      {event.notes && <p className={`mt-4 text-sm ${mutedText}`}>Notes: {event.notes}</p>}
    </Modal>
  );
}
