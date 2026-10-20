import { requireAdmin } from "@/lib/admin-auth";
import { melbourneToday } from "@/lib/dates";
import { type EventRecord, listEvents } from "@/lib/events";
import AdminFrame, { errorMessage } from "../AdminFrame";
import EventsManager from "./EventsManager";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  await requireAdmin();

  let events: EventRecord[] = [];
  let loadError: string | null = null;
  try {
    events = await listEvents();
  } catch (err) {
    loadError = errorMessage(err);
  }

  return (
    <AdminFrame
      title="Events"
      description="Plan events and how many staff each one needs, then roster them on the Roster tab."
      loadError={loadError}
    >
      <EventsManager events={events} today={melbourneToday()} />
    </AdminFrame>
  );
}
