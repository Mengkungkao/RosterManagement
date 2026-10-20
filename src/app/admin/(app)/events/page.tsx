import { requireAdmin } from "@/lib/admin-auth";
import { type AppData, loadAll } from "@/lib/config-sheet";
import { melbourneToday } from "@/lib/dates";
import AdminFrame, { errorMessage } from "../AdminFrame";
import EventsManager from "./EventsManager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  let data: AppData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadAll();
  } catch (err) {
    loadError = errorMessage(err);
  }
  const params = await searchParams;

  return (
    <AdminFrame
      title="Events"
      description="Create an event in four short steps — details, the work it needs, the run of show, review — then staff it on the Roster."
      loadError={loadError}
    >
      {data && (
        <EventsManager
          events={data.events}
          today={melbourneToday()}
          taskTypes={data.taskTypes}
          skills={data.skills}
          templates={data.templates}
          settings={data.settings}
          openNew={params.new === "1"}
          editId={typeof params.edit === "string" ? params.edit : null}
        />
      )}
    </AdminFrame>
  );
}
