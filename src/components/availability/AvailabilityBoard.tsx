"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DAYS, availabilityGiven } from "@/lib/availability";
import { formatWeekdayDate, isValidDate, toMinutes } from "@/lib/dates";
import { EMPLOYMENT_LABELS } from "@/lib/employment";
import { staffHref } from "@/lib/overview";
import { timeOffOn } from "@/lib/profile";
import { type Shift, type TimeWindow, checkAvailability, formatWindow, sameName } from "@/lib/roster";
import type { StaffMember } from "@/lib/staff";
import RequestsPanel, { type PendingRequest, describeRequest } from "../dashboard/RequestsPanel";
import { Badge, type Tone } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, SearchInput } from "../ui/Field";
import { cn } from "../ui/cn";
import AvailabilityHeatmap from "./AvailabilityHeatmap";

type Answer = { person: StaffMember; key: "free" | "partial" | "working" | "timeoff" | "unavailable"; text: string };

const ORDER: Answer["key"][] = ["free", "partial", "working", "timeoff", "unavailable"];
const LABELS: Record<Answer["key"], [string, Tone]> = {
  free: ["Free", "success"],
  partial: ["Free for part", "warning"],
  working: ["Already working", "info"],
  timeoff: ["Time off", "warning"],
  unavailable: ["Not available", "neutral"],
};

// Who can work on a given date (and time): weekly availability, time off and
// shifts already rostered, all in one list.
function WhoIsFree({ staff, shifts, today }: { staff: StaffMember[]; shifts: Shift[]; today: string }) {
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const valid = isValidDate(date);
  const window: TimeWindow = useMemo(() => {
    if (from && to && from !== to) {
      const start = toMinutes(from);
      let end = toMinutes(to);
      if (end <= start) end += 1440;
      return { start, end };
    }
    return { start: 0, end: 1440 };
  }, [from, to]);

  const answers: Answer[] = valid
    ? staff
        .filter((p) => p.active)
        .map((person): Answer => {
          const own = shifts.filter((s) => s.date === date && sameName(s.staffName, person.staffName));
          const off = timeOffOn(person.requests, date, date);
          const check = checkAvailability(person.week, date, window);
          if (off) return { person, key: "timeoff", text: off.status === "approved" ? "Approved leave" : "Asked for time off" };
          if (own.length) return { person, key: "working", text: own.map((s) => `${formatWindow(s)} ${s.eventName}`).join(", ") };
          if (check.coverage === "full") return { person, key: "free", text: from && to ? `Free ${from}–${to}` : "Free all day" };
          if (check.coverage === "partial") return { person, key: "partial", text: `Free ${formatWindow(check.free!)}` };
          return { person, key: "unavailable", text: "Not available that day" };
        })
    : [];
  const groups = ORDER.map((k) => ({ key: k, items: answers.filter((a) => a.key === k) })).filter((g) => g.items.length);

  return (
    <Card>
      <CardHeader title="Who's free" description="Weekly availability, time off and shifts already rostered, for one date." />
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
        <Field label="Date" hint={valid ? formatWeekdayDate(date) : undefined}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="From" optional>
          <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" optional>
          <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {groups.length === 0 ? (
        <EmptyState compact icon="users" title={valid ? "No active staff" : "Choose a date"} />
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="sticky top-0 flex items-center gap-2 bg-surface-2 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                {LABELS[g.key][0]} <span className="tabular-nums">· {g.items.length}</span>
              </h3>
              <ul className="divide-y divide-line">
                {g.items.map((a) => (
                  <li key={a.person.staffName} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <Link href={staffHref(a.person.staffName)} className="min-w-0 flex-1 truncate font-medium text-fg hover:underline">
                      {a.person.staffName}
                    </Link>
                    <span className="hidden text-xs text-muted sm:inline">{EMPLOYMENT_LABELS[a.person.employmentType]}</span>
                    <Badge tone={LABELS[a.key][1]} icon={false}>
                      {a.text}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

function WeeklyTable({ staff }: { staff: StaffMember[] }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = staff.filter((s) => s.active && (!q || s.staffName.toLowerCase().includes(q)));
  const counts = DAYS.map((d) => staff.filter((s) => s.active && s.week[d].status !== "unavailable").length);
  const given = (p: StaffMember) => availabilityGiven(p.week, p.updatedAt);
  return (
    <Card>
      <CardHeader
        title="Weekly availability"
        description="What each person said they can usually work. Staff change it themselves on the staff page."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Find a person" label="Find a person" className="w-48" />}
      />
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-xs" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 border-r border-b border-line bg-surface-2 px-4 py-2 text-left font-medium text-muted">
                Staff
              </th>
              {DAYS.map((d, i) => (
                <th key={d} scope="col" className="sticky top-0 z-10 border-b border-line bg-surface-2 px-2 py-2 text-left font-medium text-muted">
                  {d.slice(0, 3)} <span className="font-normal tabular-nums">· {counts[i]} free</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.staffName} className="hover:bg-surface-2">
                <th scope="row" className="sticky left-0 z-10 border-r border-b border-line bg-surface px-4 py-2 text-left font-normal">
                  <Link href={staffHref(p.staffName)} className="text-[13px] font-medium text-fg hover:underline">
                    {p.staffName}
                  </Link>
                  {!given(p) && <span className="block text-subtle">Not set yet</span>}
                </th>
                {DAYS.map((d) => {
                  const day = p.week[d];
                  return (
                    <td key={d} className="border-b border-line px-2 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded px-1.5 py-0.5 font-medium tabular-nums",
                          !given(p)
                            ? "text-subtle"
                            : day.status === "unavailable"
                              ? "bg-surface-3 text-muted"
                              : "bg-success-soft text-success"
                        )}
                      >
                        {!given(p) ? "—" : day.status === "available_all_day" ? "All day" : day.status === "custom" ? `${day.startTime}–${day.endTime}` : "Off"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <EmptyState compact icon="users" title="No one matches" />}
      </div>
    </Card>
  );
}

export default function AvailabilityBoard({
  staff,
  shifts,
  today,
}: {
  staff: StaffMember[];
  shifts: Shift[];
  today: string;
}) {
  const pending: PendingRequest[] = staff.flatMap((s) => s.requests.filter((r) => r.status === "pending").map((r) => ({ ...r, staffName: s.staffName })));
  const approved = staff
    .flatMap((s) => s.requests.filter((r) => r.kind === "time_off" && r.status === "approved" && r.to >= today).map((r) => ({ ...r, staffName: s.staffName })))
    .sort((a, b) => a.from.localeCompare(b.from));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <WhoIsFree staff={staff} shifts={shifts} today={today} />
        <div className="space-y-6">
          <Card>
            <CardHeader title="Requests waiting" description="Time off keeps them off the roster until you decline it." />
            <RequestsPanel requests={pending} />
          </Card>
          <Card>
            <CardHeader title="Approved time off" description="From today on." />
            {approved.length === 0 ? (
              <EmptyState compact icon="calendar" title="No approved time off coming up" />
            ) : (
              <ul className="divide-y divide-line">
                {approved.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Link href={staffHref(r.staffName)} className="font-medium text-fg hover:underline">
                      {r.staffName}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-fg-2">{describeRequest(r).replace(/^Time off /, "")}</span>
                    <Badge tone="success" icon="check">
                      Approved
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <WeeklyTable staff={staff} />
      {staff.some((s) => s.active) && <AvailabilityHeatmap staff={staff.filter((s) => s.active)} />}
    </div>
  );
}
