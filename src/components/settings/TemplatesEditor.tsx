"use client";

import { useState } from "react";
import type { EventTemplate, RelativeTime } from "@/lib/templates";
import { formatHours } from "@/lib/dates";
import { input, linkButton, messageClass, mutedText, primaryButton, secondaryButton } from "../../ui";
import { move, useSaver } from "./useSaver";

function relative([anchor, offset]: RelativeTime): string {
  if (offset === 0) return anchor;
  return `${anchor} ${offset > 0 ? "+" : "−"}${formatHours(Math.abs(offset) / 60)}`;
}

// Saved staffing structures. New ones are made from an event (Events → Review
// → "Save these tasks as a template").
export default function TemplatesEditor({ templates }: { templates: EventTemplate[] }) {
  const [list, setList] = useState(templates);
  const { save, saving, message } = useSaver();
  const dirty = JSON.stringify(list) !== JSON.stringify(templates);

  return (
    <div>
      {list.length === 0 ? (
        <p className={`text-sm ${mutedText}`}>No templates. Make one from an event&apos;s Review step.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((t, i) => (
            <li key={t.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={t.name}
                  onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  aria-label="Template name"
                  className={`min-w-48 flex-1 font-medium ${input}`}
                />
                <button type="button" onClick={() => setList(move(list, i, -1))} disabled={i === 0} className={`${secondaryButton} px-2 py-1`} aria-label="Move up">
                  ↑
                </button>
                <button type="button" onClick={() => setList(move(list, i, 1))} disabled={i === list.length - 1} className={`${secondaryButton} px-2 py-1`} aria-label="Move down">
                  ↓
                </button>
                <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))} className={`${linkButton} text-red-600 dark:text-red-400`}>
                  Delete
                </button>
              </div>
              <ul className={`mt-2 grid gap-x-4 text-xs sm:grid-cols-2 ${mutedText}`}>
                {t.tasks.map((task, k) => (
                  <li key={k}>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{task.name}</span> × {task.count} ·{" "}
                    {relative(task.from)} → {relative(task.to)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={saving || !dirty} onClick={() => save("/api/admin/config/templates", { templates: list }, "Templates saved.")} className={primaryButton}>
          {saving ? "Saving…" : "Save templates"}
        </button>
        {dirty && <span className={`text-sm ${mutedText}`}>Unsaved changes</span>}
        {message && <span className={`text-sm ${messageClass(message.type)}`}>{message.text}</span>}
      </div>
    </div>
  );
}
