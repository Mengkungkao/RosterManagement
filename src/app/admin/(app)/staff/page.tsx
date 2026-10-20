import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { fortnightStartFor, melbourneToday } from "@/lib/dates";
import { rosterHref } from "@/lib/overview";
import { eventsInRange, formatWindow, listShifts, summarizeHours } from "@/lib/roster";
import { LoadError, errorMessage } from "@/components/shell/PageHeader";
import StaffDirectory from "@/components/staff/StaffDirectory";
import type { UpcomingShift } from "@/components/staff/StaffProfile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StaffPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  const { person } = await searchParams;
  const today = melbourneToday();
  const anchor = data.settings.fortnightStart;
  const fortnightStart = fortnightStartFor(today, anchor);
  const shifts = listShifts(data.events);
  const hours = summarizeHours(data.staff, shifts, fortnightStart);

  // Each person's shifts for the next two weeks, for their profile.
  const upcoming: Record<string, UpcomingShift[]> = {};
  const soon = eventsInRange(data.events, today, 14);
  for (const s of listShifts(soon).sort((a, b) => a.absStart - b.absStart)) {
    const event = soon.find((e) => e.id === s.eventId)!;
    (upcoming[s.staffName.trim().toLowerCase()] ??= []).push({
      date: s.date,
      time: formatWindow(s),
      eventName: s.eventName,
      taskName: s.taskName,
      href: rosterHref(fortnightStartFor(s.date, anchor), s.eventId, s.taskId),
      draft: event.status === "draft",
    });
  }

  return (
    <StaffDirectory
      staff={data.staff}
      skills={data.skills}
      rates={data.settings.awardRates}
      hours={hours}
      shifts={upcoming}
      today={today}
      initialPerson={typeof person === "string" ? person : null}
    />
  );
}
