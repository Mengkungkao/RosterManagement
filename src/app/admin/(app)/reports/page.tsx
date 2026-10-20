import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AWARD_LEVELS, DEFAULT_AWARD_RATES, DEFAULT_RATES_FROM } from "@/lib/award";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { addDays } from "@/lib/dates";
import { pickFortnight } from "@/lib/fortnight-param";
import { buildFortnight, nearbyEvents } from "@/lib/overview";
import Reports from "@/components/reports/Reports";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  const params = await searchParams;
  const { currentFortnight, fortnightStart } = pickFortnight(params.fortnight, data.settings.fortnightStart);
  const fortnight = buildFortnight(nearbyEvents(data.events, fortnightStart), data.staff, data.settings, data.skills, fortnightStart);
  // Still on the built-in rates in a fortnight after the next 1 July: they've probably gone up.
  const nextRise = `${Number(DEFAULT_RATES_FROM.slice(0, 4)) + 1}-07-01`;
  const ratesOutOfDate =
    addDays(fortnightStart, 13) >= nextRise && AWARD_LEVELS.every((level) => data.settings.awardRates[level] === DEFAULT_AWARD_RATES[level]);
  const tab = params.tab === "wages" || params.tab === "events" ? params.tab : "hours";

  return (
    <>
      <PageHeader description="Hours against each person's rules, estimated minimum award pay, and what each event costs — by pay fortnight." />
      <Reports
        key={fortnightStart}
        fortnight={fortnight}
        fortnightStart={fortnightStart}
        currentFortnight={currentFortnight}
        ratesOutOfDate={ratesOutOfDate}
        initialTab={tab}
      />
    </>
  );
}
