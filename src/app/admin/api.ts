// Sends a change to the server and turns any failure into a sentence the
// manager can act on. A 409 means someone else changed the same thing first.
export async function send<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    if (res.status === 401) return { ok: false, status: 401, error: "You've been signed out. Sign in again and retry." };
    return { ok: false, status: res.status, error: (data as { error?: string }).error || "Couldn't save. Please try again." };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check the connection and try again — nothing was saved." };
  }
}
