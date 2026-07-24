import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listRosterAssignments } from "@/lib/roster-sheet";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const assignments = await listRosterAssignments();
    return NextResponse.json({ assignments });
  } catch (err) {
    console.error("Failed to load roster", err);
    return NextResponse.json({ error: "Failed to load roster" }, { status: 500 });
  }
}
