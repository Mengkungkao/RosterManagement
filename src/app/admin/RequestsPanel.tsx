"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatWeekdayDate } from "@/lib/dates";
import type { StaffRequest } from "@/lib/profile";
import { card, errorText, mutedText, secondaryButton } from "../ui";
import { send } from "./api";

type Pending = StaffRequest & { staffName: string };

function describe(r: Pending): string {
  if (r.kind === "change") return `Change to ${r.eventName || "a shift"} on ${formatWeekdayDate(r.from)}`;
  return r.from === r.to
    ? `Time off ${formatWeekdayDate(r.from)}`
    : `Time off ${formatWeekdayDate(r.from)} – ${formatWeekdayDate(r.to)}`;
}

// Time-off and shift-change requests waiting for an answer. Time off keeps
// the person off the roster until it's declined.
export default function RequestsPanel({ requests }: { requests: Pending[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(r: Pending, status: "approved" | "declined" | "resolved") {
    setBusy(r.id);
    setError(null);
    const result = await send("/api/admin/staff", "PATCH", { name: r.staffName, requestDecision: { id: r.id, status } });
    setBusy(null);
    if (!result.ok) setError(result.error);
    else startRefresh(() => router.refresh());
  }

  if (requests.length === 0) {
    return <p className={`mt-2 text-sm ${mutedText}`}>No requests waiting.</p>;
  }
  return (
    <>
      {error && <p className={`mt-2 text-sm ${errorText}`}>{error}</p>}
      <ul className={`mt-2 divide-y divide-zinc-100 ${card} dark:divide-zinc-900`}>
        {requests.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              <Link href={`/admin/staff?person=${encodeURIComponent(r.staffName)}`} className="hover:underline">
                {r.staffName}
              </Link>{" "}
              · {describe(r)}
            </div>
            {r.note && <p className={`mt-0.5 text-sm ${mutedText}`}>“{r.note}”</p>}
            <p className={`mt-0.5 text-xs ${mutedText}`}>
              Sent {r.submitted.slice(0, 16)}
              {r.kind === "time_off" && " · kept off the roster for these days until declined"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.kind === "time_off" ? (
                <>
                  <button type="button" disabled={busy !== null || refreshing} onClick={() => decide(r, "approved")} className={`${secondaryButton} py-1`}>
                    {busy === r.id ? "Saving…" : "Approve"}
                  </button>
                  <button type="button" disabled={busy !== null || refreshing} onClick={() => decide(r, "declined")} className={`${secondaryButton} py-1`}>
                    Decline
                  </button>
                </>
              ) : (
                <button type="button" disabled={busy !== null || refreshing} onClick={() => decide(r, "resolved")} className={`${secondaryButton} py-1`}>
                  {busy === r.id ? "Saving…" : "Mark as sorted"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
