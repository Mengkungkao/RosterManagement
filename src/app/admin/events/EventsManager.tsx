"use client";

import { useEffect, useState } from "react";
import type { Eventaction, EventRecord } from "@/lib/events";

type Message = { type: "success" | "error"; text: string } | null;

const EMPTY_FORM = {
  name: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  notes: "",
  actions: [] as Eventaction[],
};

export default function EventsManager() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/events");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load events");
      setEvents(data.events);
    } catch {
      setMessage({ type: "error", text: "Couldn't load events." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial fetch on mount — intentional, not a render-driven sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEvents();
  }, []);

  function startEdit(event: EventRecord) {
    setEditingId(event.id);
    setForm({
      name: event.name,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      notes: event.notes,
      actions: event.actions,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function addaction() {
    setForm({
      ...form,
      actions: [...form.actions, { label: "", time: "" }],
    });
  }

  function updateaction(index: number, field: keyof Eventaction, value: string) {
    setForm({
      ...form,
      actions: form.actions.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    });
  }

  function removeaction(index: number) {
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== index) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.date || !form.startTime || !form.endTime) {
      setMessage({
        type: "error",
        text: "Name, date, start time, and end time are required.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(
        editingId ? `/api/admin/events/${editingId}` : "/api/admin/events",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save event");
      setMessage({
        type: "success",
        text: editingId ? "Event updated." : "Event added.",
      });
      cancelEdit();
      await loadEvents();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save event",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete event");
      if (editingId === id) cancelEdit();
      await loadEvents();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete event",
      });
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <form
        onSubmit={handleSubmit}
        className="h-fit rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
          {editingId ? "Edit event" : "Add event"}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-zinc-600 dark:text-zinc-400">
              Event name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-600 dark:text-zinc-400">
              Date
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="mt-1 w-max rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-zinc-600 dark:text-zinc-400">
                Start
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="mt-1 w-max rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-zinc-600 dark:text-zinc-400">
                End
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="mt-1 w-max rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-600 dark:text-zinc-400">
              Location
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-600 dark:text-zinc-400">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm text-zinc-600 dark:text-zinc-400">
                actions (optional)
              </label>
              <button
                type="button"
                onClick={addaction}
                className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
              >
                + Add action
              </button>
            </div>
            {form.actions.length > 0 && (
              <div className="mt-2 space-y-2">
                {form.actions.map((action, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="time"
                      value={action.time}
                      onChange={(e) => updateaction(index, "time", e.target.value)}
                      className="w-max rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <input
                      type="text"
                      placeholder={`Activity ${index + 1} e.g. Entree serve`}
                      value={action.label}
                      onChange={(e) => updateaction(index, "label", e.target.value)}
                      className="flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <button
                      type="button"
                      onClick={() => removeaction(index)}
                      className="px-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Remove action"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {message && (
          <p
            className={`mt-3 text-sm ${
              message.type === "success"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Add event"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
            No events yet.
          </p>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Event
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Date
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Time
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Location
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400" />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-3 align-top font-medium text-zinc-800 dark:text-zinc-200">
                    {event.name}
                    {event.actions.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        {event.actions.map((action, i) => (
                          <li key={i}>
                            {action.time && (
                              <span className="tabular-nums">{action.time} </span>
                            )}
                            {action.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {event.date}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {event.startTime}–{event.endTime}
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                    {event.location || "—"}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(event)}
                      className="mr-3 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(event.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
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
