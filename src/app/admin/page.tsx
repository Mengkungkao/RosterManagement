import { requireAdmin } from "@/lib/admin-auth";
import { addDays, fortnightStartFor } from "@/lib/dates";
import { type EventRecord, listEvents } from "@/lib/events";
import { DEFAULT_SETTINGS, type PaySettings } from "@/lib/settings";
import { readSettings } from "@/lib/settings-sheet";
import { type StaffMember, readAllStaff } from "@/lib/staff";
import AdminFrame, { errorMessage } from "./AdminFrame";
import FortnightNav from "./FortnightNav";
import RosterBoard from "./RosterBoard";
import { pickFortnight } from "./fortnight";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  let events: EventRecord[] = [];
  let staff: StaffMember[] = [];
  let settings: PaySettings = DEFAULT_SETTINGS;
  let loadError: string | null = null;
  try {
    [events, staff, settings] = await Promise.all([listEvents(), readAllStaff(), readSettings()]);
  } catch (err) {
    loadError = errorMessage(err);
  }

  const { today, currentFortnight, fortnightStart } = pickFortnight(
    (await searchParams).fortnight,
    settings.fortnightStart
  );
  // A day either side as well, so overnight shifts next to the fortnight still show as clashes.
  const nearby = events.filter(
    (e) => e.date >= addDays(fortnightStart, -1) && e.date <= addDays(fortnightStart, 14)
  );
  // Shown when this fortnight has no events, as a shortcut to the next one.
  const upcoming = events.find((e) => e.date >= today);
  const nextEvent = upcoming
    ? {
        date: upcoming.date,
        name: upcoming.name,
        href: `/admin?fortnight=${fortnightStartFor(upcoming.date, settings.fortnightStart)}`,
      }
    : null;

  return (
    <AdminFrame
      title="Roster"
      description="Who works each event, by pay fortnight. Click an event to add or remove people, or let Auto-fill choose within everyone's hours."
      loadError={loadError}
    >
      <RosterBoard
        key={fortnightStart}
        events={nearby}
        staff={staff}
        fortnightStart={fortnightStart}
        anchor={settings.fortnightStart}
        today={today}
        nextEvent={nextEvent}
        nav={
          <FortnightNav basePath="/admin" fortnightStart={fortnightStart} currentFortnight={currentFortnight} />
        }
      />
    </AdminFrame>
  );
}
