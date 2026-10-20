"use client";

import { useMemo, useState } from "react";
import { formatWeekdayDate } from "@/lib/dates";
import { type Gap, type Proposal, formatWindow } from "@/lib/roster";
import { send } from "../admin/api";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Dialog } from "../ui/Overlay";

const key = (p: Proposal) => `${p.eventId}|${p.taskId}|${p.staffName}|${p.startTime}`;

// The draft from Generate roster: who would go where and why, and what
// couldn't be filled. Nothing is saved until the manager adds it.
export default function GenerateReview({
  proposals,
  gaps,
  onApplied,
  onOpenTask,
  onClose,
}: {
  proposals: Proposal[];
  gaps: Gap[];
  onApplied: (result: { applied: number; skipped: { staffName: string; eventName: string; reason: string }[] }) => void;
  onOpenTask: (eventId: string, taskId: string) => void;
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
    const result = await send<{ applied: number; skipped: { staffName: string; eventName: string; reason: string }[] }>(
      "/api/admin/roster/apply",
      "POST",
      { proposals: proposals.filter((p) => chosen.has(key(p))) }
    );
    setSaving(false);
    if (!result.ok) setError(result.error);
    else onApplied(result.data);
  }

  const toggle = (p: Proposal) =>
    setChosen((all) => {
      const next = new Set(all);
      if (next.has(key(p))) next.delete(key(p));
      else next.add(key(p));
      return next;
    });

  return (
    <Dialog
      size="lg"
      title="Draft roster"
      subtitle="Nothing is saved yet. Untick anyone you don't want, then add the rest. People already rostered stay as they are."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="check" loading={saving} disabled={chosen.size === 0} onClick={apply}>
            Add {chosen.size} {chosen.size === 1 ? "assignment" : "assignments"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Discard draft
          </Button>
          {proposals.length > 1 && (
            <Button
              variant="link"
              size="sm"
              className="ml-auto"
              onClick={() => setChosen(chosen.size === proposals.length ? new Set() : new Set(proposals.map(key)))}
            >
              {chosen.size === proposals.length ? "Untick all" : "Tick all"}
            </Button>
          )}
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-4" role="alert">
          {error}
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="success" icon="checkCircle">
          {proposals.length} to add
        </Badge>
        <Badge tone={gaps.length ? "warning" : "success"} icon={gaps.length ? "alert" : "check"}>
          {gaps.length} still open
        </Badge>
      </div>

      {proposals.length === 0 ? (
        <Alert tone="info" title="No one else can be added safely">
          Everyone who could work an open position is already rostered or fails a check. The reasons are below.
        </Alert>
      ) : (
        <div className="space-y-5">
          {byEvent.map(([eventId, group]) => (
            <section key={eventId}>
              <h3 className="text-sm font-semibold text-fg">
                {group.name} <span className="font-normal text-muted">· {formatWeekdayDate(group.date)}</span>
              </h3>
              <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
                {group.items.map((p) => (
                  <li key={key(p)}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={chosen.has(key(p))} onChange={() => toggle(p)} />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium text-fg">{p.staffName}</span>
                        <span className="text-muted">
                          {" "}
                          → {p.taskName} · <span className="tabular-nums">{formatWindow(p.window)}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-fg-2">{p.reason}</span>
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
          <h3 className="text-sm font-semibold text-fg">Still open after this draft</h3>
          <ul className="mt-2 space-y-2">
            {gaps.map((g) => (
              <li key={`${g.eventId}|${g.taskId}`} className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-fg">
                    {g.eventName} · {g.taskName}: {g.missing > 0 ? `${g.missing} open` : "team incomplete"}
                  </span>
                  <Button variant="link" size="sm" className="text-xs" iconRight="arrowRight" onClick={() => onOpenTask(g.eventId, g.taskId)}>
                    Open task
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  {formatWeekdayDate(g.date)}
                  {g.short.length > 0 && ` · short ${g.short.map(formatWindow).join(", ")}`}
                </p>
                {g.note && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warning">
                    <Icon name="shield" size={13} className="mt-px" />
                    {g.note}
                  </p>
                )}
                {g.reasons.length > 0 && (
                  <p className="mt-1 text-xs text-fg-2">Why: {g.reasons.map((r) => `${r.count} ${r.label}`).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
