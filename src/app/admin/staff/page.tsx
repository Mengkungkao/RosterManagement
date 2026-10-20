import { requireAdmin } from "@/lib/admin-auth";
import { DEFAULT_SETTINGS, type PaySettings } from "@/lib/settings";
import { readSettings } from "@/lib/settings-sheet";
import { type StaffMember, readAllStaff } from "@/lib/staff";
import AdminFrame, { errorMessage } from "../AdminFrame";
import AvailabilityHeatmap from "../AvailabilityHeatmap";
import StaffManager from "./StaffManager";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  await requireAdmin();

  let staff: StaffMember[] = [];
  let settings: PaySettings = DEFAULT_SETTINGS;
  let loadError: string | null = null;
  try {
    [staff, settings] = await Promise.all([readAllStaff(), readSettings()]);
  } catch (err) {
    loadError = errorMessage(err);
  }

  return (
    <AdminFrame
      title="Staff"
      description={`${staff.length} staff. Set each person's type (the hours they can be rostered) and award level (their pay).`}
      loadError={loadError}
    >
      <StaffManager staff={staff} rates={settings.awardRates} />
      {staff.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Who&apos;s free when</h2>
          <AvailabilityHeatmap staff={staff} />
        </section>
      )}
    </AdminFrame>
  );
}
