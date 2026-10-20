import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { formatWeekdayDate } from "@/lib/dates";
import EventForm from "@/components/events/EventForm";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit event" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EditEventPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  const { id } = await params;
  const { from } = await searchParams;
  const event = data.events.find((e) => e.id === decodeURIComponent(id));
  if (!event) {
    return (
      <EmptyState icon="calendar" title="Event not found" action={<ButtonLink href="/admin/events">Back to events</ButtonLink>}>
        It may have been deleted, or its row in the sheet can&apos;t be read.
      </EmptyState>
    );
  }
  return (
    <>
      <PageHeader
        description={
          <>
            <span className="font-medium text-fg">{event.name}</span> · {formatWeekdayDate(event.date)} ·{" "}
            {event.status === "draft" ? "draft — not shown to staff" : "published"}. People already rostered stay on their tasks.
          </>
        }
      />
      <EventForm
        event={event}
        copyOf={null}
        taskTypes={data.taskTypes}
        skills={data.skills}
        templates={data.templates}
        settings={data.settings}
        returnTo={from === "events" ? "events" : "roster"}
      />
    </>
  );
}
