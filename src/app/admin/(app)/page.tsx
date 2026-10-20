import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import { addDays, formatDateRange, formatHours, formatWeekdayDate, fortnightStartFor, melbourneToday } from "@/lib/dates";
import { type DashboardItem, type EventView, buildDashboard, rosterHref, rosterStatus } from "@/lib/overview";
import RequestsPanel from "@/components/dashboard/RequestsPanel";
import { money } from "@/components/roster/model";
import { StatusBadge } from "@/components/roster/StatusBadge";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Icon, type IconName, Progress } from "@/components/ui";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

function Metric({ label, value, detail, href, tone }: { label: string; value: string; detail: string; href: string; tone?: "warning" | "danger" }) {
  return (
    <Link href={href} className="group rounded-lg border border-line bg-surface px-4 py-3 shadow-card transition-colors hover:border-line-strong">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tracking-tight tabular-nums", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg")}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted group-hover:text-fg-2">{detail}</p>
    </Link>
  );
}

function EventLine({ v, href, showDate }: { v: EventView; href: string; showDate: boolean }) {
  const status = rosterStatus(v);
  const open = v.staffing.needed - v.staffing.filled;
  return (
    <li>
      <Link href={href} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_9rem_8.5rem_auto]">
        <span className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
          <span className="block truncate text-sm font-medium text-fg">{v.event.name}</span>
          <span className="block truncate text-xs text-muted tabular-nums">
            {showDate && `${formatWeekdayDate(v.event.date)} · `}
            {v.event.startTime}–{v.event.endTime}
            {v.event.location && ` · ${v.event.location}`}
          </span>
        </span>
        <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
          <span className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-fg tabular-nums">
              {v.staffing.filled}/{v.staffing.needed}
            </span>
            <span className="text-muted">{open > 0 ? `${open} open` : "filled"}</span>
          </span>
          <Progress value={v.staffing.filled} max={v.staffing.needed} label={`${v.staffing.filled} of ${v.staffing.needed} positions filled`} className="mt-1" />
        </span>
        <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-start">
          <StatusBadge status={status} />
        </span>
        <span className="hidden items-center gap-1 text-[13px] font-medium text-primary-text sm:flex">
          {status.key === "attention" || status.key === "draft" ? "Complete" : "Review"}
          <Icon name="chevronRight" size={14} />
        </span>
      </Link>
    </li>
  );
}

function AttentionGroup({ title, icon, items }: { title: string; icon: IconName; items: DashboardItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="flex items-center gap-1.5 bg-surface-2 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
        <Icon name={icon} size={12} />
        {title} <span className="tabular-nums">· {items.length}</span>
      </h3>
      <ul className="divide-y divide-line">
        {items.slice(0, 6).map((item, i) => (
          <li key={i}>
            <Link href={item.href} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-2">
              <Icon name={item.severity === "warning" ? "alert" : "info"} size={14} className={cn("mt-0.5", item.severity === "warning" ? "text-warning" : "text-primary-text")} />
              <span className="min-w-0 flex-1">
                <span className="sr-only">{item.severity === "warning" ? "Warning: " : "Note: "}</span>
                <span className="block text-[13px] font-medium text-fg">{item.title}</span>
                <span className="block text-xs text-muted">{item.detail}</span>
              </span>
              <Icon name="chevronRight" size={14} className="mt-0.5 text-subtle" />
            </Link>
          </li>
        ))}
        {items.length > 6 && <li className="px-4 py-2 text-xs text-muted">+ {items.length - 6} more</li>}
      </ul>
    </section>
  );
}

export default async function DashboardPage() {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }

  const today = melbourneToday();
  const fortnightStart = fortnightStartFor(today, data.settings.fortnightStart);
  const pending = data.staff.flatMap((s) => s.requests.filter((r) => r.status === "pending").map((r) => ({ ...r, staffName: s.staffName })));
  const d = buildDashboard(data.events, data.staff, data.settings, data.skills, today, fortnightStart, data.unreadableEvents, pending.length);
  const m = d.metrics;
  const issues = d.sheet.length + d.conflicts.length + d.openPositions.length + d.availability.length + d.expiries.length + d.hours.length;
  const nextEvent = data.events.find((e) => e.date >= today);

  const actions = (
    <>
      <ButtonLink href={`/admin/roster?fortnight=${fortnightStart}&generate=1`} icon="sparkle">
        Generate roster
      </ButtonLink>
      <ButtonLink href="/admin/events/new" variant="primary" icon="plus">
        Create event
      </ButtonLink>
    </>
  );

  if (data.events.length === 0) {
    return (
      <>
        <PageHeader description="Your events, staffing and anything that needs a decision." />
        <Card>
          <EmptyState
            icon="calendar"
            title="Create your first event"
            action={
              <>
                <ButtonLink href="/admin/events/new" variant="primary" icon="plus">
                  Create event
                </ButtonLink>
                <ButtonLink href="/admin/staff" icon="users">
                  {data.staff.length ? `Review ${data.staff.length} staff` : "Add staff"}
                </ButtonLink>
              </>
            }
          >
            Add the event, the tasks it needs and when. Then Generate roster proposes people who are available and
            qualified, for you to review.
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        description={
          <>
            Pay fortnight {formatDateRange(fortnightStart, addDays(fortnightStart, 13))} · today is {formatWeekdayDate(today)}
          </>
        }
        actions={actions}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Upcoming events" value={String(m.upcomingEvents)} detail="today to the end of the fortnight" href={rosterHref(fortnightStart)} />
        <Metric
          label="Unfilled positions"
          value={String(m.unfilled)}
          detail={m.unfilled ? "mandatory positions still open" : "every position is filled"}
          href={rosterHref(fortnightStart)}
          tone={m.unfilled ? "warning" : undefined}
        />
        <Metric
          label="Roster conflicts"
          value={String(m.conflicts)}
          detail={m.conflicts ? "problems to fix on upcoming events" : "no conflicts"}
          href="#attention"
          tone={m.conflicts ? "danger" : undefined}
        />
        <Metric
          label="Planned staff hours"
          value={formatHours(m.rosteredHours)}
          detail={`of ${formatHours(m.plannedHours)} needed · ≈ ${money.format(m.cost)}${m.missingLevels ? ` (+${m.missingLevels} unpriced)` : ""}`}
          href={`/admin/reports?fortnight=${fortnightStart}`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Today" description={formatWeekdayDate(today)} actions={<ButtonLink size="sm" variant="ghost" href={rosterHref(fortnightStart)} iconRight="arrowRight">Roster</ButtonLink>} />
            {d.today.length === 0 ? (
              <EmptyState compact icon="calendar" title="No events today">
                {nextEvent && nextEvent.date > today && (
                  <>
                    Next: <Link href={d.hrefFor[nextEvent.id] ?? rosterHref(fortnightStartFor(nextEvent.date, data.settings.fortnightStart), nextEvent.id)} className="font-medium text-primary-text hover:underline">{nextEvent.name}</Link>, {formatWeekdayDate(nextEvent.date)}
                  </>
                )}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {d.today.map((v) => (
                  <EventLine key={v.event.id} v={v} href={d.hrefFor[v.event.id]} showDate={false} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Next 14 days" description="Staffing for each event — open one to complete or review its roster." />
            {d.upcoming.length === 0 ? (
              <EmptyState compact icon="calendar" title="Nothing in the next two weeks" action={<ButtonLink href="/admin/events/new" icon="plus">Create event</ButtonLink>} />
            ) : (
              <ul className="divide-y divide-line">
                {d.upcoming.map((v) => (
                  <EventLine key={v.event.id} v={v} href={d.hrefFor[v.event.id]} showDate />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader id="attention" title="Needs attention" description={issues ? "Each item opens the event or person to fix it." : undefined} actions={issues ? <Badge tone="warning">{issues}</Badge> : undefined} />
            {issues === 0 ? (
              <EmptyState compact icon="checkCircle" title="Nothing needs attention">
                Every position in the next two weeks is filled by people who pass every check.
              </EmptyState>
            ) : (
              <div className="overflow-hidden rounded-b-lg">
                <AttentionGroup title="Google Sheet" icon="fileText" items={d.sheet} />
                <AttentionGroup title="Roster conflicts" icon="shield" items={d.conflicts} />
                <AttentionGroup title="Unfilled positions" icon="userPlus" items={d.openPositions} />
                <AttentionGroup title="Availability problems" icon="clock" items={d.availability} />
                <AttentionGroup title="Qualifications" icon="checkCircle" items={d.expiries} />
                <AttentionGroup title="Hour limits" icon="alert" items={d.hours} />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Staff requests" description={pending.length ? `${pending.length} waiting for an answer` : undefined} />
            <RequestsPanel requests={pending} />
          </Card>

          {d.drafts.length > 0 && (
            <Card>
              <CardHeader title="Not published yet" description="Staff can't see these events until you publish them." />
              <AttentionGroup title="Drafts" icon="circleDashed" items={d.drafts} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
