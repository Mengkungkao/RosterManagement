"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatWeekdayDate } from "@/lib/dates";
import type { StaffRequest } from "@/lib/profile";
import { send } from "../admin/api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { useToast } from "../ui/feedback";

export type PendingRequest = StaffRequest & { staffName: string };

export function describeRequest(r: StaffRequest): string {
  if (r.kind === "change") return `Change to ${r.eventName || "a shift"} on ${formatWeekdayDate(r.from)}`;
  return r.from === r.to ? `Time off ${formatWeekdayDate(r.from)}` : `Time off ${formatWeekdayDate(r.from)} – ${formatWeekdayDate(r.to)}`;
}

// Time-off and shift-change requests waiting for an answer. Time off keeps
// the person off the roster until it's declined.
export default function RequestsPanel({ requests, emptyText = "No requests waiting." }: { requests: PendingRequest[]; emptyText?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(r: PendingRequest, status: "approved" | "declined" | "resolved") {
    setBusy(r.id + status);
    const result = await send("/api/admin/staff", "PATCH", { name: r.staffName, requestDecision: { id: r.id, status } });
    setBusy(null);
    if (!result.ok) {
      toast.error(`Couldn't answer ${r.staffName}'s request: ${result.error}`);
      return;
    }
    toast.success(
      status === "approved"
        ? `Approved ${r.staffName}'s time off.`
        : status === "declined"
          ? `Declined ${r.staffName}'s time off — they can be rostered on those days again.`
          : `Marked ${r.staffName}'s request as sorted.`
    );
    startRefresh(() => router.refresh());
  }

  if (requests.length === 0) return <EmptyState compact icon="checkCircle" title={emptyText} />;
  return (
    <ul className="divide-y divide-line">
      {requests.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm text-fg">
              <Link href={`/admin/staff?person=${encodeURIComponent(r.staffName)}`} className="font-medium hover:underline">
                {r.staffName}
              </Link>
              <span className="text-fg-2"> · {describeRequest(r)}</span>
            </p>
            <Badge tone="warning" icon="clock">
              Waiting
            </Badge>
          </div>
          {r.note && <p className="mt-1 text-[13px] text-fg-2">“{r.note}”</p>}
          <p className="mt-1 text-xs text-muted">
            Sent {r.submitted.slice(0, 16)}
            {r.kind === "time_off" && " · kept off the roster for these days until declined"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.kind === "time_off" ? (
              <>
                <Button size="sm" icon="check" loading={busy === r.id + "approved"} disabled={busy !== null || refreshing} onClick={() => decide(r, "approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="ghost" loading={busy === r.id + "declined"} disabled={busy !== null || refreshing} onClick={() => decide(r, "declined")}>
                  Decline
                </Button>
              </>
            ) : (
              <Button size="sm" icon="check" loading={busy === r.id + "resolved"} disabled={busy !== null || refreshing} onClick={() => decide(r, "resolved")}>
                Mark as sorted
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
