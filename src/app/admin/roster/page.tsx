import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from "@/lib/admin-auth";
import { readAllAvailability } from "@/lib/sheets";
import { listEvents } from "@/lib/events";
import { buildWeeklyGrid } from "@/lib/roster-grid";
import { DAYS } from "@/lib/availability";
import AdminControls from "../AdminControls";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export default async function RosterMatchPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSessionValid(sessionCookie)) {
    redirect("/admin/login");
  }

  let grid: ReturnType<typeof buildWeeklyGrid> | null = null;
  let loadError: string | null = null;
  try {
    const [staff, events] = await Promise.all([readAllAvailability(), listEvents()]);
    grid = buildWeeklyGrid(events, staff);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load roster match";
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 dark:bg-black sm:py-16">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Roster Match
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Events (indigo) and available staff (green) by day and hour, in
              Melbourne time.
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

        {grid && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                  <th className="sticky left-0 z-10 w-16 bg-white px-2 py-2 font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                    Time
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="px-2 py-2 font-medium text-zinc-600 dark:text-zinc-400"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 24 }, (_, hour) => (
                  <tr
                    key={hour}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                  >
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1.5 align-top text-zinc-500 dark:bg-zinc-950 dark:text-zinc-500">
                      {formatHour(hour)}
                    </td>
                    {DAYS.map((day) => {
                      const cell = grid![day][hour];
                      const hasEvent = cell.events.length > 0;
                      return (
                        <td
                          key={day}
                          className={`px-2 py-1.5 align-top ${
                            hasEvent
                              ? "bg-indigo-50 dark:bg-indigo-950/40"
                              : ""
                          }`}
                        >
                          <div className="space-y-1">
                            {cell.events.map((event, i) => (
                              <div
                                key={`${event.eventId}-${i}`}
                                className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200"
                              >
                                {event.phaseLabel ? (
                                  <>
                                    {event.name}
                                    <span className="block font-normal text-indigo-600 dark:text-indigo-300">
                                      {event.phaseLabel}
                                    </span>
                                  </>
                                ) : (
                                  event.name
                                )}
                              </div>
                            ))}
                            {cell.staff.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {cell.staff.map((name) => (
                                  <span
                                    key={name}
                                    className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
