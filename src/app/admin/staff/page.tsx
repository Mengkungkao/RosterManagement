import { requireAdmin } from "@/lib/admin-auth";
import { type AppData, loadAll } from "@/lib/config-sheet";
import { melbourneToday } from "@/lib/dates";
import AdminFrame, { errorMessage } from "../AdminFrame";
import AvailabilityHeatmap from "../AvailabilityHeatmap";
import StaffManager from "./StaffManager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminStaffPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  let data: AppData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadAll();
  } catch (err) {
    loadError = errorMessage(err);
  }
  const params = await searchParams;
  const active = data?.staff.filter((s) => s.active) ?? [];

  return (
    <AdminFrame
      title="Staff"
      description={`${active.length} active staff. Open a profile to record skills and qualifications, restrictions and shift preferences.`}
      loadError={loadError}
    >
      {data && (
        <>
          <StaffManager
            staff={data.staff}
            skills={data.skills}
            rates={data.settings.awardRates}
            today={melbourneToday()}
            initialPerson={typeof params.person === "string" ? params.person : null}
          />
          {active.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Who&apos;s free when</h2>
              <AvailabilityHeatmap staff={active} />
            </section>
          )}
        </>
      )}
    </AdminFrame>
  );
}
