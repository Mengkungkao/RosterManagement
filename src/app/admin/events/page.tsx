import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, isAdminSessionValid } from "@/lib/admin-auth";
import AdminControls from "../AdminControls";
import AdminNav from "../AdminNav";
import EventsManager from "./EventsManager";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSessionValid(sessionCookie)) {
    redirect("/admin/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 pt-6 pb-10 dark:bg-black sm:pt-8 sm:pb-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Events
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Plan upcoming events, then check Roster Match to see who&apos;s
              available to work them.
            </p>
          </div>
          <AdminControls />
        </div>
        <AdminNav />
        <EventsManager />
      </div>
    </div>
  );
}
