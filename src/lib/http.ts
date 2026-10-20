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

export function serverError(what: string, err: unknown) {
  console.error(`Failed to ${what}`, err);
  return NextResponse.json({ error: `Failed to ${what}` }, { status: 500 });
}
