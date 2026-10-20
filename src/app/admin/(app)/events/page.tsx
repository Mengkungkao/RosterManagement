import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { melbourneToday } from "@/lib/dates";
import EventsList from "@/components/events/EventsList";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";
import { ButtonLink } from "@/components/ui/Button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  // Links from the previous version.
  if (params.new === "1") redirect("/admin/events/new");
  if (typeof params.edit === "string") redirect(`/admin/events/${encodeURIComponent(params.edit)}?from=events`);

  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  return (
    <>
      <PageHeader
        description="Every function, conference and service, with the work each one needs. Staff them on the Roster."
        actions={
          <ButtonLink href="/admin/events/new" variant="primary" icon="plus">
            Create event
          </ButtonLink>
        }
      />
      <EventsList events={data.events} today={melbourneToday()} anchor={data.settings.fortnightStart} />
    </>
  );
}
