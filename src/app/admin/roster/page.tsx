import { requireAdmin } from "@/lib/admin-auth";
import { type AppData, loadAll } from "@/lib/config-sheet";
import { fortnightStartFor } from "@/lib/dates";
import { nearbyEvents } from "@/lib/overview";
import AdminFrame, { errorMessage } from "../AdminFrame";
import FortnightNav from "../FortnightNav";
import RosterBoard from "../RosterBoard";
import { pickFortnight } from "../fortnight";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  let data: AppData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadAll();
  } catch (err) {
    loadError = errorMessage(err);
  }
  const params = await searchParams;
  const description =
    "The roster by pay fortnight. Open an event to staff its tasks, or Generate a draft that fills open positions safely for you to review.";
  if (!data) {
    return <AdminFrame title="Roster" description={description} loadError={loadError}>{null}</AdminFrame>;
  }

  // An ?event= link opens on that event's fortnight.
  const linked = typeof params.event === "string" ? data.events.find((e) => e.id === params.event) : undefined;
  const { today, currentFortnight, fortnightStart } = pickFortnight(
    typeof params.fortnight === "string" ? params.fortnight : linked?.date,
    data.settings.fortnightStart
  );
  const upcoming = data.events.find((e) => e.date >= today);
  const nextEvent = upcoming
    ? {
        date: upcoming.date,
        name: upcoming.name,
        href: `/admin/roster?fortnight=${fortnightStartFor(upcoming.date, data.settings.fortnightStart)}`,
      }
    : null;

  return (
    <AdminFrame title="Roster" description={description}>
      <RosterBoard
        key={fortnightStart}
        events={nearbyEvents(data.events, fortnightStart)}
        staff={data.staff}
        settings={data.settings}
        skills={data.skills}
        taskTypes={data.taskTypes}
        templates={data.templates}
        fortnightStart={fortnightStart}
        today={today}
        nextEvent={nextEvent}
        initialEventId={linked ? linked.id : null}
        initialView={params.view === "timeline" ? "timeline" : "events"}
        autoGenerate={params.generate === "1"}
        nav={<FortnightNav basePath="/admin/roster" fortnightStart={fortnightStart} currentFortnight={currentFortnight} />}
      />
    </AdminFrame>
  );
}
