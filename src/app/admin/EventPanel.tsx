"use client";

import { useEffect, useState } from "react";
import { formatHours, formatMinutes, formatWeekdayDate } from "@/lib/dates";
import {
  DAILY_MAX_HOURS,
  EMPLOYMENT_LABELS,
  FULL_TIME_FORTNIGHT_HOURS,
  PART_TIME_MIN_WEEKLY_HOURS,
} from "@/lib/employment";
import type { EventInput, EventRecord, RosterEntry } from "@/lib/events";
import {
  type Candidate,
  type Shift,
  type TimeWindow,
  entryWindow,
  formatWindow,
  minCoverage,
  rankCandidates,
  sameName,
  shiftWindow,
  windowBreaks,
  windowHours,
} from "@/lib/roster";
import { splitIntoParts } from "@/lib/work-time";
import type { StaffMember } from "@/lib/staff";
import { errorText, input, linkButton, mutedText, secondaryButton, warningText } from "../ui";
import StaffingPill from "./StaffingPill";

interface Props {
  event: EventRecord;
  staff: StaffMember[];
  shifts: Shift[];
  anchor: string;
  issues: string[];
  busy: boolean;
  onSaved: () => void;
  onClose: () => void;
}

function RosteredRow({
  event,
  entry,
  type,
  breaks,
  disabled,
  onChange,
  onRemove,
}: {
  event: EventRecord;
  entry: RosterEntry;
  type: string;
  breaks: TimeWindow[];
  disabled: boolean;
  onChange: (entry: RosterEntry) => void;
  onRemove: () => void;
}) {
  const window = entryWindow(event, entry);
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(formatMinutes(window.start));
  const [end, setEnd] = useState(formatMinutes(window.end));

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{entry.name}</span>
          <span className={`ml-2 text-xs ${mutedText}`}>{type}</span>
          {breaks.length > 0 && (
            <div className={`text-xs ${mutedText}`}>
              Unpaid break {breaks.map(formatWindow).join(", ")}
            </div>
          )}
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
          onClick={onRemove}
          disabled={disabled}
          className="px-1 text-zinc-400 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
          aria-label={`Take ${entry.name} off this event`}
        >
          ✕
        </button>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
          <span className={mutedText}>to</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
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
              Use the event&apos;s shift
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
}: {
  candidate: Candidate;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div>
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{candidate.staffName}</span>
          <span className={`ml-2 text-xs ${mutedText}`}>
            {EMPLOYMENT_LABELS[candidate.employmentType]} · {formatHours(candidate.fortnightHours)} this fortnight
          </span>
        </div>
        {candidate.blockers.map((b) => (
          <div key={b} className={`text-xs ${errorText}`}>
            {b}
          </div>
        ))}
        {candidate.notes.map((n) => (
          <div key={n} className={`text-xs ${warningText}`}>
            {n}
          </div>
        ))}
      </div>
      <button type="button" onClick={onAdd} disabled={disabled} className={`${secondaryButton} py-1`}>
        Add
      </button>
    </li>
  );
}

export default function EventPanel({ event, staff, shifts, anchor, issues, busy, onSaved, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = saving || busy;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shift = shiftWindow(event);
  // A shift longer than one person may work is rostered in parts (early/late).
  const parts: TimeWindow[] = splitIntoParts(shift.start, shift.end).map(([start, end]) => ({ start, end }));
  const [partIndex, setPartIndex] = useState(() =>
    Math.max(0, parts.findIndex((part) => minCoverage(event, part) < event.staffNeeded))
  );
  const target = parts[Math.min(partIndex, parts.length - 1)];
  const covered = minCoverage(event);
  const candidates = rankCandidates(event, staff, shifts, anchor, target);
  const free = candidates.filter((c) => c.blockers.length === 0);
  const blocked = candidates.filter((c) => c.blockers.length > 0);
  const typeOf = (name: string) => {
    const person = staff.find((s) => sameName(s.staffName, name));
    return person ? EMPLOYMENT_LABELS[person.employmentType] : "Not on staff list";
  };

  async function save(request: () => Promise<Response>) {
    setSaving(true);
    setError(null);
    try {
      const res = await request();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const saveStaff = (entries: RosterEntry[]) =>
    save(() =>
      fetch(`/api/admin/events/${encodeURIComponent(event.id)}/staff`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff: entries }),
      })
    );

  const saveDetails = (changes: Partial<EventInput>) => {
    const { id: _id, staff: _staff, ...details } = event;
    return save(() =>
      fetch(`/api/admin/events/${encodeURIComponent(event.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, ...changes }),
      })
    );
  };

  // Adds someone for the chosen part of the shift, or just the time they're free.
  const add = (candidate: Candidate) => {
    const times = candidate.coverage === "partial" && candidate.free ? candidate.free : parts.length > 1 ? target : null;
    saveStaff([
      ...event.staff,
      {
        name: candidate.staffName,
        startTime: times ? formatMinutes(times.start) : "",
        endTime: times ? formatMinutes(times.end) : "",
      },
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.name}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{event.name}</h2>
            <p className={`mt-0.5 text-sm ${mutedText}`}>
              {formatWeekdayDate(event.date)} · {event.startTime}–{event.endTime}
              {event.location && ` · ${event.location}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">
            Staff shift <span className="font-medium tabular-nums">{formatWindow(shift)}</span>
            <span className={mutedText}>
              {" "}
              (incl. setup {formatHours(event.setupHours)} and pack-down {formatHours(event.packDownHours)})
            </span>
            {parts.length > 1 && (
              <span className={`block text-xs ${mutedText}`}>
                Longer than one person may work ({DAILY_MAX_HOURS}h a day), so it&apos;s rostered as{" "}
                {parts.map(formatWindow).join(" and ")}.
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span className={mutedText}>Needs</span>
            <button
              type="button"
              disabled={disabled || event.staffNeeded === 0}
              onClick={() => saveDetails({ staffNeeded: event.staffNeeded - 1 })}
              className={`${secondaryButton} px-2 py-0.5`}
              aria-label="Need one fewer"
            >
              −
            </button>
            <span className="w-6 text-center font-medium tabular-nums">{event.staffNeeded}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => saveDetails({ staffNeeded: event.staffNeeded + 1 })}
              className={`${secondaryButton} px-2 py-0.5`}
              aria-label="Need one more"
            >
              +
            </button>
          </span>
        </div>

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

        {event.actions.length > 0 && (
          <ul className={`mt-3 space-y-0.5 text-xs ${mutedText}`}>
            {event.actions.map((a, i) => (
              <li key={i}>
                <span className="tabular-nums">{a.time || event.startTime}</span> {a.label}
              </li>
            ))}
          </ul>
        )}

        {issues.length > 0 && (
          <ul className={`mt-3 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/40 ${warningText}`}>
            {issues.map((issue) => (
              <li key={issue}>⚠ {issue}</li>
            ))}
          </ul>
        )}
        {error && <p className={`mt-3 text-sm ${errorText}`}>{error}</p>}

        <section className="mt-5">
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Rostered <StaffingPill filled={covered} needed={event.staffNeeded} />
            {event.staff.length !== covered && (
              <span className={`font-normal ${mutedText}`}>
                {event.staff.length} {event.staff.length === 1 ? "person" : "people"}, at least {covered} on at all
                times
              </span>
            )}
            {(saving || busy) && <span className={`font-normal ${mutedText}`}>Saving…</span>}
          </h3>
          {event.staff.length === 0 ? (
            <p className={`mt-1 text-sm ${mutedText}`}>No one yet — add someone below or use Auto-fill.</p>
          ) : (
            <ul className="mt-1 divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
              {event.staff.map((entry, i) => (
                <RosteredRow
                  key={`${entry.name}-${entry.startTime}-${entry.endTime}`}
                  event={event}
                  entry={entry}
                  type={typeOf(entry.name)}
                  breaks={
                    shifts.find((s) => s.eventId === event.id && sameName(s.staffName, entry.name))?.breaks ??
                    windowBreaks(entryWindow(event, entry))
                  }
                  disabled={disabled}
                  onChange={(changed) => saveStaff(event.staff.map((e, j) => (j === i ? changed : e)))}
                  onRemove={() => saveStaff(event.staff.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add someone</h3>
          {parts.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {parts.map((part, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPartIndex(i)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums ${
                    i === partIndex
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  {formatWindow(part)} · {minCoverage(event, part)}/{event.staffNeeded}
                </button>
              ))}
            </div>
          )}
          <p className={`mt-1 text-xs ${mutedText}`}>
            Best fit first: part-timers short of {PART_TIME_MIN_WEEKLY_HOURS}h this week, then full-timers
            under {FULL_TIME_FORTNIGHT_HOURS}h, then whoever has the fewest hours; people already on another
            function at the time come after those who aren&apos;t.
          </p>
          {free.length === 0 ? (
            <p className={`mt-1 text-sm ${mutedText}`}>No one else is free for this shift.</p>
          ) : (
            <ul className="mt-1 divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
              {free.map((c) => (
                <CandidateRow key={c.staffName} candidate={c} disabled={disabled} onAdd={() => add(c)} />
              ))}
            </ul>
          )}
          {blocked.length > 0 && (
            <details className="mt-2">
              <summary className={`cursor-pointer text-sm ${mutedText}`}>
                Not free or over their hours ({blocked.length})
              </summary>
              <ul className="mt-1 divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
                {blocked.map((c) => (
                  <CandidateRow key={c.staffName} candidate={c} disabled={disabled} onAdd={() => add(c)} />
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
