"use client";

import { useState } from "react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import type { IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/feedback";
import type { OwnRequest } from "./StaffAccessGate";

const STATUS: Record<OwnRequest["status"], { text: string; tone: Tone; icon: IconName }> = {
  pending: { text: "Waiting for your manager", tone: "warning", icon: "clock" },
  approved: { text: "Approved", tone: "success", icon: "check" },
  declined: { text: "Declined", tone: "neutral", icon: "x" },
  resolved: { text: "Sorted", tone: "success", icon: "check" },
};

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
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
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.text}
    </Badge>
  );
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
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeOff = requests.filter((r) => r.kind === "time_off");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from) {
      setError("Choose the first day you can't work.");
      return;
    }
    setBusy("new");
    setError(null);
    const result = await sendRequest("POST", { name, password, kind: "time_off", from, to: to || from, note });
    setBusy(null);
    if (!result.ok) {
      if (result.status === 401) lock(result.error);
      else setError(result.error);
      return;
    }
    onChange(result.requests);
    setFrom("");
    setTo("");
    setNote("");
    toast.success("Sent. You won't be rostered on those days unless your manager declines it.");
  }

  async function withdraw(id: string) {
    setBusy(id);
    const result = await sendRequest("DELETE", { name, password, id });
    setBusy(null);
    if (result.ok) {
      onChange(result.requests);
      toast.success("Request withdrawn.");
    } else setError(result.error);
  }

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="text-sm font-semibold text-fg">Dates you can&apos;t work</h2>
      <p className="mt-0.5 text-xs text-muted">Leave, exams, appointments — anything that changes your usual week for particular dates.</p>
      {timeOff.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {timeOff.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-fg">{describeRequest(r)}</span>
                {r.note && <span className="block text-xs text-muted">{r.note}</span>}
              </span>
              <StatusChip status={r.status} />
              {r.status === "pending" && (
                <Button size="sm" variant="ghost" loading={busy === r.id} disabled={busy !== null} onClick={() => withdraw(r.id)}>
                  Withdraw
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" optional hint="Leave empty for one day">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Note for your manager" optional className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error && (
          <p className="text-sm text-danger sm:col-span-2" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" icon="calendar" loading={busy === "new"} disabled={busy !== null} className="sm:col-span-2 sm:justify-self-start">
          Ask for these days off
        </Button>
      </form>
    </section>
  );
}
