import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { fortnightStartFor } from "@/lib/dates";
import { pickFortnight } from "@/lib/fortnight-param";
import { nearbyEvents } from "@/lib/overview";
import RosterWorkspace from "@/components/roster/RosterWorkspace";
import { LoadError, errorMessage } from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Roster" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  const params = await searchParams;
  const param = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  // An ?event= link opens on that event's fortnight.
  const linked = param("event") ? data.events.find((e) => e.id === param("event")) : undefined;
  const { today, currentFortnight, fortnightStart } = pickFortnight(param("fortnight") ?? linked?.date, data.settings.fortnightStart);
  const upcoming = data.events.find((e) => e.date >= today);
  const view = param("view");

  return (
    <RosterWorkspace
      key={fortnightStart}
      events={nearbyEvents(data.events, fortnightStart)}
      staff={data.staff}
      settings={data.settings}
      skills={data.skills}
      taskTypes={data.taskTypes}
      templates={data.templates}
      fortnightStart={fortnightStart}
      currentFortnight={currentFortnight}
      today={today}
      nextEvent={
        upcoming
          ? {
              date: upcoming.date,
              name: upcoming.name,
              href: `/admin/roster?fortnight=${fortnightStartFor(upcoming.date, data.settings.fortnightStart)}`,
            }
          : null
      }
      initialEventId={linked ? linked.id : null}
      initialTaskId={linked ? (param("task") ?? null) : null}
      initialView={view === "timeline" || view === "staff" ? view : "events"}
      autoGenerate={param("generate") === "1"}
    />
  );
}
