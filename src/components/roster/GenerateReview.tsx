"use client";

import { useMemo, useState } from "react";
import { formatWeekdayDate } from "@/lib/dates";
import { type Gap, type Proposal, formatWindow } from "@/lib/roster";
import { errorBox, linkButton, mutedText, primaryButton, secondaryButton, warningBox } from "../ui";
import { send } from "./api";
import Modal from "./Modal";

const key = (p: Proposal) => `${p.eventId}|${p.taskId}|${p.staffName}|${p.startTime}`;

// The draft from Generate roster: who would be added where and why, and what
// couldn't be filled. Nothing is saved until the manager accepts it.
export default function GenerateReview({
  proposals,
  gaps,
  onApplied,
  onOpenEvent,
  onClose,
}: {
  proposals: Proposal[];
  gaps: Gap[];
  onApplied: (message: { type: "success" | "warning"; text: string }) => void;
  onOpenEvent: (id: string) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => new Set(proposals.map(key)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byEvent = useMemo(() => {
    const groups = new Map<string, { name: string; date: string; items: Proposal[] }>();
    for (const p of proposals) {
      const g = groups.get(p.eventId) ?? { name: p.eventName, date: p.date, items: [] };
      g.items.push(p);
      groups.set(p.eventId, g);
    }
    return [...groups.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
  }, [proposals]);

  async function apply() {
    setSaving(true);
    setError(null);
    const accepted = proposals.filter((p) => chosen.has(key(p)));
    const result = await send<{ applied: number; skipped: { staffName: string; eventName: string; reason: string }[] }>(
      "/api/admin/roster/apply",
      "POST",
      { proposals: accepted }
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { applied, skipped } = result.data;
    onApplied({
      type: skipped.length ? "warning" : "success",
      text:
        `Added ${applied} ${applied === 1 ? "person" : "people"}.` +
        (skipped.length
          ? ` Skipped ${skipped.length} because the roster changed since the draft: ${skipped
              .map((s) => `${s.staffName} (${s.eventName}: ${s.reason})`)
              .join("; ")}.`
          : "") +
        " Check the open positions below, then publish when ready.",
    });
  }

  const toggle = (p: Proposal) =>
    setChosen((all) => {
      const next = new Set(all);
      if (next.has(key(p))) next.delete(key(p));
      else next.add(key(p));
      return next;
    });

  return (
    <Modal
      title="Draft roster"
      subtitle="Nothing is saved yet. Untick anyone you don't want, then add the rest. People already rostered stay as they are."
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={apply} disabled={saving || chosen.size === 0} className={primaryButton}>
            {saving ? "Saving…" : `Add ${chosen.size} ${chosen.size === 1 ? "person" : "people"}`}
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Discard draft
          </button>
          {proposals.length > 0 && (
            <button
              type="button"
              onClick={() => setChosen(chosen.size === proposals.length ? new Set() : new Set(proposals.map(key)))}
              className={linkButton}
            >
              {chosen.size === proposals.length ? "Untick all" : "Tick all"}
            </button>
          )}
        </div>
      }
    >
      {error && <div className={`mb-3 ${errorBox}`}>{error}</div>}

      {proposals.length === 0 ? (
        <p className={`text-sm ${mutedText}`}>
          No one else can be added safely — everyone who could work an open position is already rostered or fails a
          check. See why below.
        </p>
      ) : (
        <div className="space-y-4">
          {byEvent.map(([eventId, group]) => (
            <section key={eventId}>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {group.name} <span className={`font-normal ${mutedText}`}>· {formatWeekdayDate(group.date)}</span>
              </h3>
              <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-900">
                {group.items.map((p) => (
                  <li key={key(p)}>
                    <label className="flex cursor-pointer items-start gap-3 py-2">
                      <input type="checkbox" className="mt-1 h-4 w-4" checked={chosen.has(key(p))} onChange={() => toggle(p)} />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.staffName}</span>
                        <span className={mutedText}>
                          {" "}
                          → {p.taskName} · <span className="tabular-nums">{formatWindow(p.window)}</span>
                        </span>
                        <span className="block text-xs text-emerald-700 dark:text-emerald-400">{p.reason}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Still open after this draft <span className={`font-normal ${mutedText}`}>· {gaps.length}</span>
          </h3>
          <ul className="mt-2 space-y-2">
            {gaps.map((g) => (
              <li key={`${g.eventId}|${g.taskId}`} className={warningBox}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {g.eventName} · {g.taskName}: {g.missing > 0 ? `${g.missing} open` : "team incomplete"}
                  </span>
                  <button type="button" onClick={() => onOpenEvent(g.eventId)} className="text-xs underline">
                    Open event
                  </button>
                </div>
                <div className="text-xs">
                  {formatWeekdayDate(g.date)}
                  {g.short.length > 0 && ` · short ${g.short.map(formatWindow).join(", ")}`}
                </div>
                {g.note && <p className="mt-1 text-xs font-medium">{g.note}</p>}
                {g.reasons.length > 0 && (
                  <p className="mt-1 text-xs">
                    Why: {g.reasons.map((r) => `${r.count} ${r.label}`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
