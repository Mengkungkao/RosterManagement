import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { type AppData, loadAll } from "@/lib/config-sheet";
import { addDays, formatDateRange, formatHours, formatWeekdayDate, fortnightStartFor, melbourneToday } from "@/lib/dates";
import { attentionItems, buildFortnight, nearbyEvents, rosterHref } from "@/lib/overview";
import { card, chip, mutedText, primaryButton, secondaryButton, tones } from "../ui";
import AdminFrame, { errorMessage } from "./AdminFrame";
import RequestsPanel from "./RequestsPanel";
import StaffingPill from "./StaffingPill";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function Tile({ label, value, detail, href }: { label: string; value: string; detail?: string; href?: string }) {
  const body = (
    <>
      <div className={`text-xs font-medium tracking-wide uppercase ${mutedText}`}>{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">{value}</div>
      {detail && <div className={`mt-0.5 text-xs ${mutedText}`}>{detail}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={`${card} block p-4 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600`}>
      {body}
    </Link>
  ) : (
    <div className={`${card} p-4`}>{body}</div>
  );
}

export default async function DashboardPage() {
  await requireAdmin();

  let data: AppData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadAll();
  } catch (err) {
    loadError = errorMessage(err);
  }

  const today = melbourneToday();
  if (!data) {
    return (
      <AdminFrame title="Dashboard" description="" loadError={loadError}>
        {null}
      </AdminFrame>
    );
  }

  const fortnightStart = fortnightStartFor(today, data.settings.fortnightStart);
  const view = buildFortnight(nearbyEvents(data.events, fortnightStart), data.staff, data.settings, data.skills, fortnightStart);
  const items = attentionItems(view, data.staff, data.skills, today, fortnightStart, data.unreadableEvents);
  const ahead = view.events.filter((v) => v.event.date >= today);
  const filled = ahead.reduce((sum, v) => sum + v.staffing.filled, 0);
  const needed = ahead.reduce((sum, v) => sum + v.staffing.needed, 0);
  const upcoming = data.events.filter((e) => e.date >= today && e.date <= addDays(today, 6));
  const upcomingViews = new Map(view.events.map((v) => [v.event.id, v]));
  const pending = data.staff.flatMap((s) =>
    s.requests.filter((r) => r.status === "pending").map((r) => ({ ...r, staffName: s.staffName }))
  );

  return (
    <AdminFrame
      title="Dashboard"
      description={`This pay fortnight: ${formatDateRange(fortnightStart, addDays(fortnightStart, 13))}. Everything that needs a decision, with a link to fix it.`}
    >
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/admin/events?new=1" className={primaryButton}>
          + Create event
        </Link>
        <Link href={`${rosterHref(fortnightStart)}&generate=1`} className={secondaryButton}>
          Generate roster
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Positions filled" value={`${filled}/${needed}`} detail="today to end of fortnight" href={rosterHref(fortnightStart)} />
        <Tile label="Events" value={String(ahead.length)} detail={`${view.events.length - ahead.length} already past this fortnight`} href={rosterHref(fortnightStart)} />
        <Tile label="Rostered hours" value={formatHours(view.wages.totalHours)} detail="this fortnight, after unpaid breaks" href={rosterHref(fortnightStart)} />
        <Tile
          label="Est. minimum labour cost"
          value={money.format(view.wages.totalPay)}
          detail={view.wages.missingLevels.length ? `${view.wages.missingLevels.length} without an award level not included` : "award minimums, before super"}
          href={`/admin/wages?fortnight=${fortnightStart}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Needs attention <span className={`font-normal ${mutedText}`}>· {items.length}</span>
          </h2>
          {items.length === 0 ? (
            <p className={`mt-2 ${card} p-4 text-sm ${mutedText}`}>
              ✓ Nothing to sort out: every position from today to the end of the fortnight is filled and checked.
            </p>
          ) : (
            <ul className={`mt-2 divide-y divide-zinc-100 ${card} dark:divide-zinc-900`}>
              {items.map((item, i) => (
                <li key={i}>
                  <Link href={item.href} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        item.severity === "warning" ? tones.warn : tones.info
                      }`}
                    >
                      {item.severity === "warning" ? "!" : "i"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{item.severity === "warning" ? "Warning: " : "Note: "}</span>
                      <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</span>
                      <span className={`block text-xs ${mutedText}`}>{item.detail}</span>
                    </span>
                    <span className={`shrink-0 text-sm ${mutedText}`} aria-hidden="true">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Staff requests <span className={`font-normal ${mutedText}`}>· {pending.length} waiting</span>
            </h2>
            <RequestsPanel requests={pending} />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Next 7 days</h2>
            {upcoming.length === 0 ? (
              <p className={`mt-2 text-sm ${mutedText}`}>No events in the next week.</p>
            ) : (
              <ul className={`mt-2 divide-y divide-zinc-100 ${card} dark:divide-zinc-900`}>
                {upcoming.map((e) => {
                  const v = upcomingViews.get(e.id);
                  return (
                    <li key={e.id}>
                      <Link
                        href={rosterHref(fortnightStartFor(e.date, data.settings.fortnightStart), e.id)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{e.name}</span>
                          <span className={`block text-xs ${mutedText}`}>
                            {formatWeekdayDate(e.date)} · {e.startTime}–{e.endTime}
                            {e.location && ` · ${e.location}`}
                          </span>
                        </span>
                        {e.status === "draft" && <span className={`${chip} ${tones.neutral}`}>Draft</span>}
                        {v && <StaffingPill filled={v.staffing.filled} needed={v.staffing.needed} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AdminFrame>
  );
}
