"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { send } from "../admin/api";
import { useToast } from "../ui/feedback";

// Saving a settings section: one request, a toast once the server has saved
// (or the reason it didn't), then fresh data.
export function useSaver() {
  const router = useRouter();
  const toast = useToast();
  const [refreshing, startRefresh] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(url: string, body: unknown, success: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    const result = await send(url, "PUT", body);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    toast.success(success);
    startRefresh(() => router.refresh());
    return true;
  }

  return { save, saving: saving || refreshing, error };
}

export function move<T>(list: T[], index: number, by: number): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
