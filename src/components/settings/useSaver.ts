"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { send } from "../api";

// Saving a settings section: one request, a message, then fresh data.
export function useSaver() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function save(url: string, body: unknown, success: string): Promise<boolean> {
    setSaving(true);
    setMessage(null);
    const result = await send(url, "PUT", body);
    setSaving(false);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return false;
    }
    setMessage({ type: "success", text: success });
    startRefresh(() => router.refresh());
    return true;
  }

  return { save, saving: saving || refreshing, message };
}

export function move<T>(list: T[], index: number, by: number): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
