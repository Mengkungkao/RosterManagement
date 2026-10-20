"use client";

import { useState } from "react";
import Link from "next/link";
import { formatHours, weekdayOf } from "@/lib/dates";
import { EMPLOYMENT_LABELS, STUDENT_MAX_FORTNIGHT_HOURS, softFortnightLimit } from "@/lib/employment";
import { staffHref } from "@/lib/overview";
import { timeOffOn } from "@/lib/profile";
import { type HoursSummary, type Shift, formatWindow, sameName } from "@/lib/roster";
import type { StaffMember } from "@/lib/staff";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Checkbox } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { cn } from "../ui/cn";

function dayLabel(date: string) {
  const [, , d] = date.split("-");
  return { day: weekdayOf(date).slice(0, 3), num: String(Number(d)) };
}

// Who works when: staff down, days across, each person's hours and rule
// checks at the end. Empty days show whether they're free.
export default function StaffGrid({
  staff,
  shifts,
  hours,
  days,
  today,
  staffName,
  search,
  eventIds,
  onOpenTask,
}: {
  staff: StaffMember[];
  shifts: Shift[];
  hours: HoursSummary[];
  days: string[];
  today: string;
  staffName: string;
  search: string;
  eventIds: Set<string>;
  onOpenTask: (eventId: string, taskId: string) => void;
}) {
  const [onlyWorking, setOnlyWorking] = useState(false);
  const inRange = shifts.filter((s) => days.includes(s.date) && eventIds.has(s.eventId));
  const q = search.trim().toLowerCase();
  const people = staff
    .filter((p) => p.active || inRange.some((s) => sameName(s.staffName, p.staffName)))
    .filter((p) => !staffName || sameName(p.staffName, staffName))
    .filter((p) => !q || p.staffName.toLowerCase().includes(q) || inRange.some((s) => sameName(s.staffName, p.staffName) && s.eventName.toLowerCase().includes(q)))
    .filter((p) => !onlyWorking || inRange.some((s) => sameName(s.staffName, p.staffName)));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-xs text-muted">Hours are worked hours after unpaid breaks, for the whole pay fortnight. Click a shift to open its task.</p>
        <Checkbox label="Only people with shifts" checked={onlyWorking} onChange={(e) => setOnlyWorking(e.target.checked)} className="text-[13px]" />
      </div>
      {people.length === 0 ? (
        <EmptyState icon="users" title="No one to show" compact>
          No staff match these filters.
        </EmptyState>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="border-separate border-spacing-0 text-xs" style={{ width: 208 + 120 + days.length * 116 }}>
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 left-0 z-20 w-52 border-r border-b border-line bg-surface-2 px-3 py-2 text-left font-medium text-muted">
                  Staff
                </th>
                <th scope="col" className="sticky top-0 z-10 w-[120px] border-r border-b border-line bg-surface-2 px-3 py-2 text-right font-medium text-muted">
                  Fortnight
                </th>
                {days.map((d) => {
                  const l = dayLabel(d);
                  return (
                    <th
                      key={d}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-10 w-[116px] border-b border-line px-2 py-2 text-left font-medium whitespace-nowrap",
                        d === today ? "bg-primary-soft text-primary-text" : "bg-surface-2 text-muted"
                      )}
                    >
                      {l.day} <span className="tabular-nums">{l.num}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const own = inRange.filter((s) => sameName(s.staffName, p.staffName));
                const row = hours.find((h) => sameName(h.staffName, p.staffName));
                const limit = p.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(p.employmentType);
                return (
                  <tr key={p.staffName} className="hover:bg-surface-2">
                    <th scope="row" className="sticky left-0 z-10 border-r border-b border-line bg-surface px-3 py-2 text-left font-normal">
                      <Link href={staffHref(p.staffName)} className="block truncate text-[13px] font-medium text-fg hover:underline">
                        {p.staffName}
                      </Link>
                      <span className="text-muted">{EMPLOYMENT_LABELS[p.employmentType]}</span>
                    </th>
                    <td className="border-r border-b border-line px-3 py-1.5 text-right align-top">
                      <span className="block text-[13px] font-medium text-fg tabular-nums">
                        {formatHours(row?.total ?? 0)}
                        {limit !== null && <span className="font-normal text-muted"> / {limit}h</span>}
                      </span>
                      {row && row.warnings.length > 0 ? (
                        <span className="mt-0.5 inline-flex items-start gap-1 text-left text-warning">
                          <Icon name="alert" size={11} className="mt-px" />
                          {row.warnings.join(" · ")}
                        </span>
                      ) : (
                        <span className="text-muted">✓ within rules</span>
                      )}
                    </td>
                    {days.map((d) => {
                      const dayShifts = own.filter((s) => s.date === d).sort((a, b) => a.start - b.start);
                      const off = timeOffOn(p.requests, d, d);
                      const avail = p.week[weekdayOf(d)];
                      return (
                        <td key={d} className={cn("border-b border-line px-1.5 py-1.5 align-top", d === today && "bg-primary-soft/40")}>
                          {dayShifts.length > 0 ? (
                            <div className="space-y-1">
                              {dayShifts.map((s) => (
                                <button
                                  key={`${s.eventId}-${s.taskId}-${s.start}`}
                                  type="button"
                                  onClick={() => onOpenTask(s.eventId, s.taskId)}
                                  className="block w-full rounded border border-line bg-surface-3 px-1.5 py-1 text-left hover:border-line-strong"
                                  title={`${s.eventName} · ${s.taskName} ${formatWindow(s)}`}
                                >
                                  <span className="block font-medium text-fg tabular-nums">{formatWindow(s)}</span>
                                  <span className="block truncate text-muted">{s.taskName && s.taskName !== "Event staff" ? s.taskName : s.eventName}</span>
                                </button>
                              ))}
                            </div>
                          ) : off ? (
                            <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-warning">
                              <Icon name="calendar" size={11} />
                              {off.status === "approved" ? "Leave" : "Time off asked"}
                            </span>
                          ) : avail.status === "unavailable" ? (
                            <span className="text-subtle">Unavailable</span>
                          ) : avail.status === "custom" ? (
                            <span className="whitespace-nowrap text-subtle tabular-nums">Free {avail.startTime}–{avail.endTime}</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
