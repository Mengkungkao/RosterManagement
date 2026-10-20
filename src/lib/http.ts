import { NextRequest, NextResponse } from "next/server";

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// Logs only the message and status: Google API errors carry the request
// (including the access token) and must never be written to the logs whole.
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const status = (err as { status?: unknown; code?: unknown }).status ?? (err as { code?: unknown }).code;
  return status ? `${err.message} (${status})` : err.message;
}

export function serverError(what: string, err: unknown) {
  console.error(`Failed to ${what}: ${describeError(err)}`);
  return NextResponse.json({ error: `Couldn't ${what}. Please try again.` }, { status: 500 });
}
