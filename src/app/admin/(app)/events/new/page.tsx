import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import EventForm from "@/components/events/EventForm";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New event" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewEventPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  const { copy } = await searchParams;
  const copyOf = typeof copy === "string" ? (data.events.find((e) => e.id === copy) ?? null) : null;
  return (
    <>
      <PageHeader
        description={
          copyOf
            ? `A copy of “${copyOf.name}” with the same tasks and run of show. Choose the date.`
            : "Details, the work it needs, then the run of show. Save it as a draft, staff it on the roster, then publish."
        }
      />
      <EventForm
        event={null}
        copyOf={copyOf}
        taskTypes={data.taskTypes}
        skills={data.skills}
        templates={data.templates}
        settings={data.settings}
        returnTo="roster"
      />
    </>
  );
}
