import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from "@/lib/admin-auth";
import { readAllAvailability, StaffAvailability } from "@/lib/sheets";
import { DAYS, DayStatus } from "@/lib/availability";
import AdminControls from "./AdminControls";
import AdminNav from "./AdminNav";

export const dynamic = "force-dynamic";

function badgeClasses(status: DayStatus) {
  if (status === "available_all_day") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (status === "custom") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  }
  return "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500";
}

function formatUpdatedAt(value: string) {
  return value || "—";
}

function statusBadgeClasses(status: string) {
  if (status === "Fully available") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (status === "Partially available") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  }
  return "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500";
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSessionValid(sessionCookie)) {
    redirect("/admin/login");
  }

  let staff: StaffAvailability[] = [];
  let loadError: string | null = null;
  try {
    staff = await readAllAvailability();
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Failed to load availability data";
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 dark:bg-black sm:py-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Staff Availability
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {staff.length} {staff.length === 1 ? "person has" : "people have"}{" "}
              submitted availability.
            </p>
          </div>
          <AdminControls />
        </div>
        <AdminNav />

        {loadError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load data from Google Sheets: {loadError}
          </div>
        )}

        {!loadError && staff.length === 0 && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No submissions yet.
          </div>
        )}

        {!loadError && staff.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    No
                  </th>
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                    Name
                  </th>
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Status
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="px-3 py-3 font-medium text-zinc-600 dark:text-zinc-400"
                    >
                      {day.slice(0, 3)}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person, index) => (
                  <tr
                    key={person.staffName}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {index + 1}
                    </td>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 font-medium text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {person.staffName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ${statusBadgeClasses(person.status)}`}
                      >
                        {person.status}
                      </span>
                    </td>
                    {DAYS.map((day) => {
                      const d = person.week[day];
                      return (
                        <td key={day} className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ${badgeClasses(d.status)}`}
                          >
                            {d.status === "available_all_day"
                              ? "All day"
                              : d.status === "custom"
                                ? `${d.startTime}–${d.endTime}`
                                : "Off"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {formatUpdatedAt(person.updatedAt)}
                    </td>
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
