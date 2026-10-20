import { requireAdmin } from "@/lib/admin-auth";
import { AWARD_LEVELS, DEFAULT_AWARD_RATES, DEFAULT_RATES_FROM } from "@/lib/award";
import { addDays } from "@/lib/dates";
import { type EventRecord, listEvents } from "@/lib/events";
import { listShifts } from "@/lib/roster";
import { DEFAULT_SETTINGS, type PaySettings } from "@/lib/settings";
import { readSettings } from "@/lib/settings-sheet";
import { type StaffMember, readAllStaff } from "@/lib/staff";
import { calculateWages } from "@/lib/wages";
import AdminFrame, { errorMessage } from "../AdminFrame";
import FortnightNav from "../FortnightNav";
import { pickFortnight } from "../fortnight";
import PaySettingsForm from "./PaySettingsForm";
import WagesTable from "./WagesTable";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WagesPage({ searchParams }: { searchParams: SearchParams }) {
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

  const { currentFortnight, fortnightStart } = pickFortnight((await searchParams).fortnight, settings.fortnightStart);
  const wages = calculateWages(staff, listShifts(events), settings, fortnightStart);
  // Still on the built-in rates in a fortnight after the next 1 July: they've probably gone up.
  const nextRise = `${Number(DEFAULT_RATES_FROM.slice(0, 4)) + 1}-07-01`;
  const ratesOutOfDate =
    addDays(fortnightStart, 13) >= nextRise &&
    AWARD_LEVELS.every((level) => settings.awardRates[level] === DEFAULT_AWARD_RATES[level]);

  return (
    <AdminFrame
      title="Wages"
      description="Minimum award pay for the fortnight, from rostered hours and each person's award level."
      loadError={loadError}
    >
      <div className="mt-4">
        <FortnightNav basePath="/admin/wages" fortnightStart={fortnightStart} currentFortnight={currentFortnight} />
      </div>
      <WagesTable summary={wages} fortnightStart={fortnightStart} ratesOutOfDate={ratesOutOfDate} />
      <PaySettingsForm key={JSON.stringify(settings)} settings={settings} />
    </AdminFrame>
  );
}
