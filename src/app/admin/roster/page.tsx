import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from "@/lib/admin-auth";
import { readAllAvailability, StaffAvailability } from "@/lib/sheets";
import { listEvents, EventRecord } from "@/lib/events";
import AdminControls from "../AdminControls";
import AdminNav from "../AdminNav";
import RosterBoard from "./RosterBoard";

export const dynamic = "force-dynamic";

export default async function RosterMatchPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSessionValid(sessionCookie)) {
    redirect("/admin/login");
  }

  let staff: StaffAvailability[] = [];
  let events: EventRecord[] = [];
  let loadError: string | null = null;
  try {
    [staff, events] = await Promise.all([readAllAvailability(), listEvents()]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load roster match";
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 pt-6 pb-10 dark:bg-black sm:pt-8 sm:pb-16 md:min-h-0">
      <div className="mx-auto flex w-full max-w-7xl flex-col md:min-h-0 md:flex-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Roster Match
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Events by day and hour, in Melbourne time. Click an event to see who&apos;s
              available for setup, the event itself, and pack-down — or save the whole
              week&apos;s roster to Google Sheets below.
            </p>
          </div>
          <AdminControls />
        </div>
        {(loadError || events.length === 0) && (
          <div className="shrink-0">
            <AdminNav />
          </div>
        )}

        {loadError && (
          <div className="mt-6 shrink-0 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load roster match: {loadError}
          </div>
        )}

        {!loadError && events.length === 0 && (
          <div className="mt-6 shrink-0 rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No events planned yet.
          </div>
        )}

        {!loadError && events.length > 0 && <RosterBoard events={events} staff={staff} />}
      </div>
    </div>
  );
}
