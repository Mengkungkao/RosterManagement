import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { melbourneToday } from "@/lib/dates";
import { listShifts } from "@/lib/roster";
import AvailabilityBoard from "@/components/availability/AvailabilityBoard";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  return (
    <>
      <PageHeader description="When your team can work: check a date, answer time-off requests, and see everyone's usual week." />
      <AvailabilityBoard staff={data.staff} shifts={listShifts(data.events)} today={melbourneToday()} />
    </>
  );
}
