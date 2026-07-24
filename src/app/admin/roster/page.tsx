import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from "@/lib/admin-auth";
import { readAllAvailability } from "@/lib/sheets";
import { listEvents } from "@/lib/events";
import { matchEventsWithAvailability } from "@/lib/roster-match";
import AdminControls from "../AdminControls";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function RosterMatchPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSessionValid(sessionCookie)) {
    redirect("/admin/login");
  }

  let matches: ReturnType<typeof matchEventsWithAvailability> = [];
  let loadError: string | null = null;
  try {
    const [staff, events] = await Promise.all([readAllAvailability(), listEvents()]);
    matches = matchEventsWithAvailability(events, staff);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load roster match";
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 dark:bg-black sm:py-16">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Roster Match
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              For each planned event, staff whose weekly availability covers it.
            </p>
          </div>
          <AdminControls />
        </div>
        <AdminNav />

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load roster match: {loadError}
          </div>
        )}

        {!loadError && matches.length === 0 && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No events planned yet.
          </div>
        )}

        {!loadError && matches.length > 0 && (
          <div className="mt-6 space-y-4">
            {matches.map(({ event, weekday, available }) => (
              <div
                key={event.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium text-zinc-900 dark:text-zinc-50">
                    {event.name}
                  </h2>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {event.date} ({weekday}) · {event.startTime}–{event.endTime}
                  </span>
                </div>
                {event.location && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {event.location}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {available.length === 0 ? (
                    <span className="text-sm text-zinc-400 dark:text-zinc-500">
                      No one is available for this event yet.
                    </span>
                  ) : (
                    available.map((person) => (
                      <span
                        key={person.staffName}
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          person.coverage === "full"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {person.staffName}
                        {person.coverage === "partial" && " (partial)"}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
