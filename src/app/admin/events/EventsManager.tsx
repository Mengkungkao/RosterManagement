"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatWeekdayDate, fortnightStartFor } from "@/lib/dates";
import type { EventRecord } from "@/lib/events";
import { eventTasks } from "@/lib/roster";
import type { PaySettings } from "@/lib/settings";
import type { SkillDef } from "@/lib/skills";
import type { TaskType } from "@/lib/tasks";
import type { EventTemplate } from "@/lib/templates";
import { card, chip, linkButton, messageClass, mutedText, primaryButton, tones } from "../../ui";
import { send } from "../api";
import EventWizard from "./EventWizard";

type Message = { type: "success" | "error"; text: string; href?: string } | null;
type Editing = { mode: "new" } | { mode: "edit"; event: EventRecord } | { mode: "copy"; event: EventRecord } | null;

function setUrl(param: string | null, value?: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete("new");
  url.searchParams.delete("edit");
  if (param && value) url.searchParams.set(param, value);
  window.history.replaceState(null, "", url);
}

export default function EventsManager({
  events,
  today,
  taskTypes,
  skills,
  templates,
  settings,
  openNew,
  editId,
}: {
  events: EventRecord[];
  today: string;
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
  settings: PaySettings;
  openNew: boolean;
  editId: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<Editing>(() => {
    const event = editId ? events.find((e) => e.id === editId) : undefined;
    return event ? { mode: "edit", event } : openNew ? { mode: "new" } : null;
  });

  const past = events.filter((e) => e.date < today);
  const shown = showPast ? events : events.filter((e) => e.date >= today);
  const rosterLink = (e: EventRecord) =>
    `/admin/roster?fortnight=${fortnightStartFor(e.date, settings.fortnightStart)}&event=${encodeURIComponent(e.id)}`;

  function open(next: Editing) {
    setEditing(next);
    setMessage(null);
    if (next?.mode === "new") setUrl("new", "1");
    else if (next?.mode === "edit") setUrl("edit", next.event.id);
    else setUrl(null);
  }

  async function handleDelete(event: EventRecord) {
    const rostered = event.staff.length > 0 ? ` ${event.staff.length} rostered shift${event.staff.length === 1 ? "" : "s"} will be removed with it.` : "";
    if (!window.confirm(`Delete “${event.name}” on ${formatWeekdayDate(event.date)}? This can't be undone.${rostered}`)) return;
    setDeleting(event.id);
    const result = await send(`/api/admin/events/${encodeURIComponent(event.id)}`, "DELETE");
    setDeleting(null);
    if (!result.ok) setMessage({ type: "error", text: result.error });
    else {
      setMessage({ type: "success", text: `Deleted “${event.name}”.` });
      startRefresh(() => router.refresh());
    }
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => open({ mode: "new" })} className={primaryButton}>
          + Create event
        </button>
        {past.length > 0 && (
          <button type="button" onClick={() => setShowPast(!showPast)} className={linkButton}>
            {showPast ? "Hide past events" : `Show past events (${past.length})`}
          </button>
        )}
      </div>
      {message && (
        <p className={`mt-3 text-sm ${messageClass(message.type)}`} role="status">
          {message.text}{" "}
          {message.href && (
            <Link href={message.href} className="underline">
              Staff it on the Roster →
            </Link>
          )}
        </p>
      )}

      <div className={`mt-4 ${card}`}>
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
            {showPast ? "All events" : "Upcoming events"}
            {refreshing && <span className={`ml-2 text-sm font-normal ${mutedText}`}>updating…</span>}
          </h2>
        </div>
        {shown.length === 0 ? (
          <p className={`p-6 text-sm ${mutedText}`}>No upcoming events — create one to get started.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {shown.map((event) => {
              const tasks = eventTasks(event);
              const positions = tasks.reduce((sum, t) => sum + t.count, 0);
              return (
                <li key={event.id} className={`flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 ${event.date < today ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{event.name}</span>
                      {event.status === "draft" ? (
                        <span className={`${chip} ${tones.neutral}`}>Draft</span>
                      ) : (
                        <span className={`${chip} ${tones.good}`}>✓ Published</span>
                      )}
                      {event.shareStaff && <span className={`${chip} ${tones.neutral}`}>Shares staff</span>}
                    </div>
                    <div className={`text-sm tabular-nums ${mutedText}`}>
                      {formatWeekdayDate(event.date)} · {event.startTime}–{event.endTime}
                      {event.location && ` · ${event.location}`}
                      {event.guests ? ` · ${event.guests} guests` : ""}
                    </div>
                    <div className={`mt-0.5 text-xs ${mutedText}`}>
                      {event.tasks.length > 0
                        ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}: ${tasks.map((t) => `${t.name} ${t.count}`).join(", ")}`
                        : `${positions} general staff`}
                      {event.actions.length > 0 && ` · ${event.actions.length} run-of-show step${event.actions.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Link href={rosterLink(event)} className={linkButton}>
                      Roster
                    </Link>
                    <button type="button" onClick={() => open({ mode: "edit", event })} className={linkButton}>
                      Edit
                    </button>
                    <button type="button" onClick={() => open({ mode: "copy", event })} className={linkButton}>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(event)}
                      disabled={deleting !== null}
                      className="font-medium text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {deleting === event.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <EventWizard
          key={editing.mode === "new" ? "new" : `${editing.mode}-${editing.event.id}`}
          event={editing.mode === "edit" ? editing.event : null}
          copyOf={editing.mode === "copy" ? editing.event : null}
          taskTypes={taskTypes}
          skills={skills}
          templates={templates}
          settings={settings}
          onClose={() => open(null)}
          onSaved={(event, created) => {
            open(null);
            setMessage({
              type: "success",
              text: created
                ? `Saved “${event.name}”${event.status === "draft" ? " as a draft" : " and published it"}.`
                : `Saved changes to “${event.name}”.`,
              href: rosterLink(event),
            });
            startRefresh(() => router.refresh());
          }}
        />
      )}
    </>
  );
}
