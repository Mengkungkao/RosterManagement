"use client";

import { useState } from "react";
import type { EventInput, EventRecord, RosterEntry } from "@/lib/events";
import { send } from "../admin/api";
import { useToast } from "../ui/feedback";

export function detailsOf(event: EventRecord): EventInput {
  const { id: _id, staff: _staff, rev: _rev, ...details } = event;
  return details;
}

// Saves changes to one event, with its revision number so someone else's
// change in the meantime is refused rather than overwritten. Success is only
// reported after the server has saved; failures are kept on screen.
export function useEventSaver(event: EventRecord, onSaved: () => void) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);

  async function save(url: string, body: unknown, success: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    const result = await send(url, "PUT", body);
    setSaving(false);
    if (!result.ok) {
      setError({ text: result.error, conflict: result.status === 409 });
      return false;
    }
    toast.success(success);
    onSaved();
    return true;
  }

  return {
    saving,
    error,
    clearError: () => setError(null),
    saveStaff: (staff: RosterEntry[], success: string) =>
      save(`/api/admin/events/${encodeURIComponent(event.id)}/staff`, { staff, rev: event.rev }, success),
    saveDetails: (changes: Partial<EventInput>, success: string) =>
      save(`/api/admin/events/${encodeURIComponent(event.id)}`, { ...detailsOf(event), ...changes, rev: event.rev }, success),
  };
}
