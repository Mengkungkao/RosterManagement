import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listEvents } from "@/lib/events";
import { readAllAvailability } from "@/lib/sheets";
import { generateRoster } from "@/lib/roster-assignment";
import { saveRoster } from "@/lib/roster-sheet";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [events, staff] = await Promise.all([listEvents(), readAllAvailability()]);
    const result = generateRoster(events, staff);
    await saveRoster(events, result);
    return NextResponse.json({
      days: result.days.length,
      staff: result.staffNames.length,
      generatedAt: result.generatedAt,
    });
  } catch (err) {
    console.error("Failed to generate roster", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate roster" },
      { status: 500 }
    );
  }
}
