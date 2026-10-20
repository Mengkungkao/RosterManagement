"use client";

import { useState } from "react";
import { formatHours } from "@/lib/dates";
import type { EventTemplate, RelativeTime } from "@/lib/templates";
import { IconButton } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Field";
import { useConfirm } from "../ui/feedback";
import { SaveBar } from "./SaveBar";
import { move, useSaver } from "./useSaver";

function relative([anchor, offset]: RelativeTime): string {
  const at = anchor === "start" ? "start" : "finish";
  if (offset === 0) return at;
  return `${at} ${offset > 0 ? "+" : "−"}${formatHours(Math.abs(offset) / 60)}`;
}

// Saved staffing structures. New ones are made from an event ("Save these
// tasks as a template" on the event form).
export default function TemplatesEditor({ templates }: { templates: EventTemplate[] }) {
  const [list, setList] = useState(templates);
  const { save, saving, error } = useSaver();
  const confirm = useConfirm();
  const dirty = JSON.stringify(list) !== JSON.stringify(templates);

  return (
    <div>
      {list.length === 0 ? (
        <EmptyState compact icon="layers" title="No templates">
          Make one from an event: “Save these tasks as a template” on the event form.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {list.map((t, i) => (
            <li key={t.id} className="rounded-lg border border-line px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={t.name}
                  onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  aria-label="Template name"
                  className="min-w-48 flex-1 font-medium"
                />
                <span className="flex">
                  <IconButton icon="chevronUp" size="sm" label={`Move ${t.name} up`} disabled={i === 0} onClick={() => setList(move(list, i, -1))} />
                  <IconButton icon="chevronDown" size="sm" label={`Move ${t.name} down`} disabled={i === list.length - 1} onClick={() => setList(move(list, i, 1))} />
                  <IconButton
                    icon="trash"
                    size="sm"
                    label={`Delete ${t.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Delete the template “${t.name}”?`, description: "Events already made from it aren't affected. The deletion is saved when you save templates.", confirmLabel: "Delete template", tone: "danger" })) {
                        setList(list.filter((_, j) => j !== i));
                      }
                    }}
                  />
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Setup {formatHours(t.setupHours)} · pack-down {formatHours(t.packDownHours)} · {t.tasks.reduce((sum, x) => sum + x.count, 0)} positions
              </p>
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
                {t.tasks.map((task, k) => (
                  <li key={k} className="flex justify-between gap-3 text-fg-2">
                    <span className="truncate">
                      {task.name} <span className="text-muted">× {task.count}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {relative(task.from)} → {relative(task.to)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <SaveBar label="Save templates" dirty={dirty} saving={saving} error={error} onReset={() => setList(templates)} onSave={() => save("/api/admin/config/templates", { templates: list }, "Templates saved.")} />
      <p className="mt-2 text-xs text-muted">
        To make a new template, open an event and choose <span className="font-medium">Save these tasks as a template</span>.
      </p>
    </div>
  );
}
