"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatWeekdayDate } from "@/lib/dates";
import type { EventAction, EventRecord } from "@/lib/events";
import { minCoverage } from "@/lib/roster";
import { card, input, label, linkButton, messageClass, mutedText, primaryButton, secondaryButton } from "../../ui";
import StaffingPill from "../StaffingPill";

type Message = { type: "success" | "error"; text: string } | null;

const EMPTY_FORM = {
  name: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  notes: "",
  actions: [] as EventAction[],
  staffNeeded: 1,
  setupHours: 1,
  packDownHours: 1,
  shareStaff: false,
};

type Form = typeof EMPTY_FORM;

function NumberField({
  title,
  value,
  step,
  max,
  onChange,
}: {
  title: string;
  value: number;
  step: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex-1">
      <span className={label}>{title}</span>
      <input
        type="number"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 w-full ${input}`}
      />
    </label>
  );
}

export default function EventsManager({ events, today }: { events: EventRecord[]; today: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const past = events.filter((e) => e.date < today);
  const shown = showPast ? events : events.filter((e) => e.date >= today);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(event: EventRecord) {
    const { id: _id, staff: _staff, ...details } = event;
    setEditingId(event.id);
    setForm(details);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      startRefresh(() => router.refresh());
      return true;
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Couldn't save" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.date || !form.startTime || !form.endTime) {
      setMessage({ type: "error", text: "Name, date, start and end time are required." });
      return;
    }
    const ok = await send(
      editingId ? `/api/admin/events/${encodeURIComponent(editingId)}` : "/api/admin/events",
      editingId ? "PUT" : "POST",
      form
    );
    if (ok) {
      setMessage({ type: "success", text: editingId ? "Event updated." : "Event added." });
      cancelEdit();
    }
  }

  async function handleDelete(event: EventRecord) {
    const rostered = event.staff.length > 0 ? ` ${event.staff.length} rostered staff will be taken off it.` : "";
    if (!window.confirm(`Delete "${event.name}" on ${formatWeekdayDate(event.date)}?${rostered}`)) return;
    if (await send(`/api/admin/events/${encodeURIComponent(event.id)}`, "DELETE")) {
      if (editingId === event.id) cancelEdit();
      setMessage({ type: "success", text: "Event deleted." });
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <form onSubmit={handleSubmit} className={`h-fit p-6 ${card}`}>
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{editingId ? "Edit event" : "Add event"}</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={label}>Event name</span>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={`mt-1 w-full ${input}`} />
          </label>
          <label className="block">
            <span className={label}>Date</span>
            <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className={`mt-1 w-full ${input}`} />
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className={label}>Starts</span>
              <input type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} className={`mt-1 w-full ${input}`} />
            </label>
            <label className="flex-1">
              <span className={label}>Ends</span>
              <input type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} className={`mt-1 w-full ${input}`} />
            </label>
          </div>
          <div className="flex gap-2">
            <NumberField title="Staff needed" value={form.staffNeeded} step={1} max={100} onChange={(v) => update("staffNeeded", v)} />
            <NumberField title="Setup (h)" value={form.setupHours} step={0.25} max={12} onChange={(v) => update("setupHours", v)} />
            <NumberField title="Pack-down (h)" value={form.packDownHours} step={0.25} max={12} onChange={(v) => update("packDownHours", v)} />
          </div>
          <p className={`text-xs ${mutedText}`}>
            Staff work from setup to pack-down: an event 18:00–22:00 with 1h each way is a 17:00–23:00 shift.
            Shifts over 6h include an unpaid 30-minute break; a shift longer than 12h of work is split into early
            and late shifts.
          </p>
          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.shareStaff}
              onChange={(e) => update("shareStaff", e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Staff can also work other functions at the same time
              <span className={`block text-xs ${mutedText}`}>
                e.g. a Studio 1 function covered by the Great Room team. Their time is only counted once.
              </span>
            </span>
          </label>
          <label className="block">
            <span className={label}>Location</span>
            <input value={form.location} onChange={(e) => update("location", e.target.value)} className={`mt-1 w-full ${input}`} />
          </label>
          <label className="block">
            <span className={label}>Notes (optional)</span>
            <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} className={`mt-1 w-full ${input}`} />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <span className={label}>Run of show (optional)</span>
              <button type="button" onClick={() => update("actions", [...form.actions, { label: "", time: "" }])} className={linkButton}>
                + Add step
              </button>
            </div>
            {form.actions.length > 0 && (
              <div className="mt-2 space-y-2">
                {form.actions.map((action, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="time"
                      value={action.time}
                      onChange={(e) =>
                        update("actions", form.actions.map((a, i) => (i === index ? { ...a, time: e.target.value } : a)))
                      }
                      className={`w-28 ${input}`}
                    />
                    <input
                      placeholder="e.g. Entree serve"
                      value={action.label}
                      onChange={(e) =>
                        update("actions", form.actions.map((a, i) => (i === index ? { ...a, label: e.target.value } : a)))
                      }
                      className={`min-w-0 flex-1 ${input}`}
                    />
                    <button
                      type="button"
                      onClick={() => update("actions", form.actions.filter((_, i) => i !== index))}
                      className="px-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Remove step"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {message && <p className={`mt-3 text-sm ${messageClass(message.type)}`}>{message.text}</p>}

        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={saving} className={`flex-1 ${primaryButton}`}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add event"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className={secondaryButton}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className={`overflow-x-auto ${card}`}>
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
            {showPast ? "All events" : "Upcoming events"}
            {refreshing && <span className={`ml-2 text-sm font-normal ${mutedText}`}>updating…</span>}
          </h2>
          {past.length > 0 && (
            <button type="button" onClick={() => setShowPast(!showPast)} className={linkButton}>
              {showPast ? "Hide past events" : `Show past events (${past.length})`}
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className={`p-6 text-sm ${mutedText}`}>No upcoming events — add one with the form.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className={`border-b border-zinc-200 text-left dark:border-zinc-800 ${mutedText}`}>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Staff</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((event) => (
                <tr
                  key={event.id}
                  className={`border-b border-zinc-100 last:border-0 dark:border-zinc-900 ${
                    event.date < today ? "opacity-60" : ""
                  } ${editingId === event.id ? "bg-zinc-50 dark:bg-zinc-900" : ""}`}
                >
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-zinc-800 dark:text-zinc-200">{event.name}</div>
                    {event.location && <div className={`text-xs ${mutedText}`}>{event.location}</div>}
                    {event.actions.length > 0 && (
                      <ul className={`mt-1 space-y-0.5 text-xs ${mutedText}`}>
                        {event.actions.map((action, i) => (
                          <li key={i}>
                            {action.time && <span className="tabular-nums">{action.time} </span>}
                            {action.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-zinc-600 tabular-nums dark:text-zinc-400">
                    {formatWeekdayDate(event.date)}
                    <div>
                      {event.startTime}–{event.endTime}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StaffingPill filled={minCoverage(event)} needed={event.staffNeeded} />
                    {event.shareStaff && <span className={`ml-1 text-xs ${mutedText}`}>shares staff</span>}
                    {event.staff.length > 0 && (
                      <div className={`mt-1 text-xs ${mutedText}`}>{event.staff.map((s) => s.name).join(", ")}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                    <button type="button" onClick={() => startEdit(event)} className={`mr-3 ${linkButton}`}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(event)}
                      disabled={saving}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
