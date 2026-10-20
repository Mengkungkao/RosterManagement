"use client";

import { useState } from "react";
import type { OwnRequest } from "./StaffAccessGate";

const STATUS: Record<OwnRequest["status"], { text: string; tone: string }> = {
  pending: { text: "Waiting for your manager", tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  approved: { text: "Approved", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  declined: { text: "Declined", tone: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  resolved: { text: "Sorted", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

const field =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-500 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

export function describeRequest(r: OwnRequest): string {
  if (r.kind === "change") return `Change to ${r.eventName} (${formatDate(r.from)})`;
  return r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} – ${formatDate(r.to)}`;
}

// Sends a request as the logged-in staff member and returns their updated list.
export async function sendRequest(
  method: "POST" | "DELETE",
  body: Record<string, unknown>
): Promise<{ ok: true; requests: OwnRequest[] } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch("/api/requests", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error || "Couldn't send it. Please try again." };
    return { ok: true, requests: data.requests ?? [] };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Please try again." };
  }
}

export function StatusChip({ status }: { status: OwnRequest["status"] }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.tone}`}>{s.text}</span>;
}

// "Dates you can't work": asks for time off; it keeps you off the roster
// for those days while your manager answers.
export default function TimeOff({
  name,
  password,
  requests,
  onChange,
  lock,
}: {
  name: string;
  password: string;
  requests: OwnRequest[];
  onChange: (requests: OwnRequest[]) => void;
  lock: (message?: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const timeOff = requests.filter((r) => r.kind === "time_off");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from) return;
    setBusy(true);
    setMessage(null);
    const result = await sendRequest("POST", { name, password, kind: "time_off", from, to: to || from, note });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 401) lock(result.error);
      else setMessage({ ok: false, text: result.error });
      return;
    }
    onChange(result.requests);
    setFrom("");
    setTo("");
    setNote("");
    setMessage({ ok: true, text: "Sent. You won't be rostered on those days unless your manager declines it." });
  }

  async function withdraw(id: string) {
    setBusy(true);
    const result = await sendRequest("DELETE", { name, password, id });
    setBusy(false);
    if (result.ok) onChange(result.requests);
    else setMessage({ ok: false, text: result.error });
  }

  return (
    <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Dates you can&apos;t work</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Leave, exams, appointments — anything that changes your usual week.
      </p>
      {timeOff.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {timeOff.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{describeRequest(r)}</span>
                {r.note && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{r.note}</span>}
              </span>
              <StatusChip status={r.status} />
              {r.status === "pending" && (
                <button type="button" disabled={busy} onClick={() => withdraw(r.id)} className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">From</span>
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <label>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">To (if more than one day)</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`mt-1 ${field}`} />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Note for your manager (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={`mt-1 ${field}`} />
        </label>
        <button
          type="submit"
          disabled={busy || !from}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 sm:col-span-2 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {busy ? "Sending…" : "Ask for these days off"}
        </button>
      </form>
      {message && (
        <p className={`mt-2 text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
