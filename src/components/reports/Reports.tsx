"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AWARD_LEVEL_NAMES, AWARD_NAME, PAY_CALCULATOR_URL, PAY_GUIDE_URL } from "@/lib/award";
import { addDays, formatDateRange, formatHours, formatWeekdayDate } from "@/lib/dates";
import { EMPLOYMENT_LABELS, STUDENT_MAX_FORTNIGHT_HOURS, softFortnightLimit } from "@/lib/employment";
import { type FortnightView, rosterHref, rosterStatus, staffHref } from "@/lib/overview";
import type { WageLine } from "@/lib/wages";
import { StatusBadge } from "../roster/StatusBadge";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button, ButtonLink } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Tabs } from "../ui/Segmented";
import { Table, TableWrap, Td, Th } from "../ui/Table";
import { cn } from "../ui/cn";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
type Tab = "hours" | "wages" | "events";

function download(filename: string, rows: (string | number)[][]) {
  const text = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function typeLabel(line: Pick<WageLine, "employmentType">) {
  return line.employmentType === "student" ? "Student (casual)" : EMPLOYMENT_LABELS[line.employmentType];
}

function Breakdown({ line }: { line: WageLine }) {
  return (
    <div className="grid gap-6 bg-surface-2 px-4 py-3 text-xs sm:grid-cols-2">
      <table className="w-full">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-medium">Pay item</th>
            <th className="py-1 text-right font-medium">Hours</th>
            <th className="py-1 text-right font-medium">Rate</th>
            <th className="py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {line.items.map((item) => (
            <tr key={item.label}>
              <td className="py-0.5">{item.label}</td>
              <td className="py-0.5 text-right">{Number(item.hours.toFixed(2))}</td>
              <td className="py-0.5 text-right">{money.format(item.rate)}</td>
              <td className="py-0.5 text-right">{money.format(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-medium">Shift</th>
            <th className="py-1 font-medium">Unpaid break</th>
            <th className="py-1 text-right font-medium">Hours</th>
            <th className="py-1 text-right font-medium">Pay</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {line.days.map((day) => (
            <tr key={day.date}>
              <td className="py-0.5">
                {formatWeekdayDate(day.date)} {day.times}
              </td>
              <td className="py-0.5">{day.breaks.join(", ") || "–"}</td>
              <td className="py-0.5 text-right">{formatHours(day.hours)}</td>
              <td className="py-0.5 text-right">{day.amount === null ? "–" : money.format(day.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Hours, wages and event costs for one pay fortnight, each downloadable.
export default function Reports({
  fortnight,
  fortnightStart,
  currentFortnight,
  ratesOutOfDate,
  initialTab,
}: {
  fortnight: FortnightView;
  fortnightStart: string;
  currentFortnight: string;
  ratesOutOfDate: boolean;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [open, setOpen] = useState<string | null>(null);
  const { wages, hours, events } = fortnight;
  const rostered = wages.lines.filter((l) => l.workedHours > 0);
  const end = addDays(fortnightStart, 13);
  const file = (name: string) => `${name}-${fortnightStart}-to-${end}.csv`;
  const nav = (start: string) => `/admin/reports?fortnight=${start}&tab=${tab}`;

  const select = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ButtonLink href={nav(addDays(fortnightStart, -14))} variant="ghost" size="sm" className="w-8 px-0" aria-label="Previous fortnight">
          <Icon name="chevronLeft" size={16} />
        </ButtonLink>
        <span className="min-w-40 text-center text-sm font-semibold text-fg tabular-nums">{formatDateRange(fortnightStart, end)}</span>
        <ButtonLink href={nav(addDays(fortnightStart, 14))} variant="ghost" size="sm" className="w-8 px-0" aria-label="Next fortnight">
          <Icon name="chevronRight" size={16} />
        </ButtonLink>
        {fortnightStart !== currentFortnight && (
          <ButtonLink href={nav(currentFortnight)} size="sm">
            This fortnight
          </ButtonLink>
        )}
        <span className="ml-auto text-sm text-muted tabular-nums">
          {formatHours(wages.totalHours)} · <span className="font-medium text-fg">{money.format(wages.totalPay)}</span> estimated minimum pay
        </span>
      </div>

      {ratesOutOfDate && (
        <Alert tone="warning" className="mb-4" title="Award rates may be out of date">
          This fortnight is after 30 June, when award rates usually go up. Check the latest pay guide and update the rates in{" "}
          <Link href="/admin/settings#pay" className="font-medium underline">
            Settings → Pay and award
          </Link>
          .
        </Alert>
      )}
      {wages.missingLevels.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${wages.missingLevels.length} rostered ${wages.missingLevels.length === 1 ? "person has" : "people have"} no award level`}>
          {wages.missingLevels.join(", ")} — their pay isn&apos;t counted. Set it on their{" "}
          <Link href="/admin/staff" className="font-medium underline">
            staff profile
          </Link>
          .
        </Alert>
      )}

      <Card>
        <div className="px-2 pt-1">
          <Tabs<Tab>
            label="Report"
            value={tab}
            onChange={select}
            tabs={[
              { value: "hours", label: "Hours", count: hours.filter((h) => h.total > 0).length },
              { value: "wages", label: "Wages", count: rostered.length },
              { value: "events", label: "Events", count: events.length },
            ]}
          />
        </div>

        {tab === "hours" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-xs text-muted">Worked hours after unpaid breaks, against each person&apos;s rules.</p>
              <Button
                size="sm"
                icon="download"
                onClick={() =>
                  download(file("hours"), [
                    ["Name", "Type", "Week 1", "Week 2", "Fortnight", "Shifts", "Check"],
                    ...hours.map((h) => [h.staffName, EMPLOYMENT_LABELS[h.employmentType], h.week1, h.week2, h.total, h.shiftCount, h.warnings.join("; ") || "OK"]),
                  ])
                }
              >
                Download CSV
              </Button>
            </div>
            <TableWrap maxHeight="65vh">
              <Table minWidth={640}>
                <thead>
                  <tr>
                    <Th sticky>Staff</Th>
                    <Th sticky>Type</Th>
                    <Th sticky align="right">Week 1</Th>
                    <Th sticky align="right">Week 2</Th>
                    <Th sticky align="right">Fortnight</Th>
                    <Th sticky>Check</Th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((row) => {
                    const limit = row.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(row.employmentType);
                    return (
                      <tr key={row.staffName} className="hover:bg-surface-2">
                        <Td>
                          <Link href={staffHref(row.staffName)} className="font-medium text-fg hover:underline">
                            {row.staffName}
                          </Link>
                        </Td>
                        <Td className="text-muted">{EMPLOYMENT_LABELS[row.employmentType]}</Td>
                        <Td align="right">{formatHours(row.week1)}</Td>
                        <Td align="right">{formatHours(row.week2)}</Td>
                        <Td align="right" className="font-medium">
                          {formatHours(row.total)}
                          {limit !== null && <span className="font-normal text-muted"> / {limit}h</span>}
                        </Td>
                        <Td>
                          {row.warnings.length ? (
                            <span className="inline-flex items-start gap-1 text-warning">
                              <Icon name="alert" size={13} className="mt-0.5" />
                              {row.warnings.join(" · ")}
                            </span>
                          ) : (
                            <span className="text-muted">✓ OK</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </>
        )}

        {tab === "wages" && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <p className="max-w-3xl text-xs text-muted">
                Estimated minimum pay under the {AWARD_NAME}: weekday, weekend and public holiday rates, Monday–Friday evening and night
                loadings, overtime and minimum paid hours. Casuals and students get casual rates. Not a payroll result — check against the{" "}
                <a href={PAY_GUIDE_URL} target="_blank" rel="noreferrer" className="underline">
                  pay guides
                </a>{" "}
                or{" "}
                <a href={PAY_CALCULATOR_URL} target="_blank" rel="noreferrer" className="underline">
                  pay calculator
                </a>
                .
              </p>
              {rostered.length > 0 && (
                <Button
                  size="sm"
                  icon="download"
                  onClick={() => {
                    const rows: (string | number)[][] = [["Name", "Type", "Award level", "Item", "Hours", "Rate", "Amount"]];
                    for (const l of rostered) {
                      const level = l.awardLevel ? AWARD_LEVEL_NAMES[l.awardLevel] : "not set";
                      for (const item of l.items) rows.push([l.staffName, typeLabel(l), level, item.label, item.hours, item.rate, item.amount]);
                      rows.push([l.staffName, typeLabel(l), level, "Total", l.workedHours, "", l.pay ?? ""]);
                    }
                    download(file("wages"), rows);
                  }}
                >
                  Download CSV
                </Button>
              )}
            </div>
            {rostered.length === 0 ? (
              <EmptyState compact icon="chart" title="No one is rostered this fortnight" />
            ) : (
              <TableWrap>
                <Table minWidth={680}>
                  <thead>
                    <tr>
                      <Th>Staff</Th>
                      <Th>Type</Th>
                      <Th>Award level</Th>
                      <Th align="right">Shifts</Th>
                      <Th align="right">Hours</Th>
                      <Th align="right">Est. pay</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {rostered.map((line) => (
                      <Fragment key={line.staffName}>
                        <tr className="hover:bg-surface-2">
                          <Td className="font-medium text-fg">{line.staffName}</Td>
                          <Td className="text-muted">{typeLabel(line)}</Td>
                          <Td>
                            {line.awardLevel ? (
                              <span className="tabular-nums">
                                {AWARD_LEVEL_NAMES[line.awardLevel]} · {money.format(line.baseRate!)}
                              </span>
                            ) : (
                              <Badge tone="warning" icon="alert">
                                Not set
                              </Badge>
                            )}
                          </Td>
                          <Td align="right">{line.days.length}</Td>
                          <Td align="right">{formatHours(line.workedHours)}</Td>
                          <Td align="right" className="font-medium">
                            {line.pay === null ? "–" : money.format(line.pay)}
                          </Td>
                          <Td align="right">
                            <Button
                              size="sm"
                              variant="ghost"
                              iconRight={open === line.staffName ? "chevronUp" : "chevronDown"}
                              aria-expanded={open === line.staffName}
                              onClick={() => setOpen(open === line.staffName ? null : line.staffName)}
                            >
                              Details
                            </Button>
                          </Td>
                        </tr>
                        {open === line.staffName && (
                          <tr>
                            <td colSpan={7} className="border-b border-line p-0">
                              {line.pay === null ? (
                                <p className="bg-surface-2 px-4 py-3 text-xs text-muted">Set an award level to see the pay breakdown.</p>
                              ) : (
                                <Breakdown line={line} />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    <tr className="bg-surface-2 font-semibold text-fg">
                      <Td colSpan={4}>Total</Td>
                      <Td align="right">{formatHours(wages.totalHours)}</Td>
                      <Td align="right">{money.format(wages.totalPay)}</Td>
                      <Td />
                    </tr>
                  </tbody>
                </Table>
              </TableWrap>
            )}
            <p className="px-4 py-3 text-xs text-muted">
              Before tax and super. Not included: junior and apprentice rates, allowances, split-shift rules, and anything an enterprise
              agreement changes. Overtime counts from 11.5h a day (12h for casuals) or 76h a fortnight. Rates and public holidays are in{" "}
              <Link href="/admin/settings#pay" className="underline">
                Settings
              </Link>
              .
            </p>
          </>
        )}

        {tab === "events" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-xs text-muted">Each event&apos;s staffing and its share of the fortnight&apos;s hours and pay.</p>
              {events.length > 0 && (
                <Button
                  size="sm"
                  icon="download"
                  onClick={() =>
                    download(file("events"), [
                      ["Date", "Event", "Status", "Filled", "Needed", "Planned hours", "Rostered hours", "Est. pay"],
                      ...events.map((v) => [v.event.date, v.event.name, rosterStatus(v).label, v.staffing.filled, v.staffing.needed, v.plannedHours, v.hours, v.cost]),
                    ])
                  }
                >
                  Download CSV
                </Button>
              )}
            </div>
            {events.length === 0 ? (
              <EmptyState compact icon="calendar" title="No events this fortnight" />
            ) : (
              <TableWrap>
                <Table minWidth={760}>
                  <thead>
                    <tr>
                      <Th>Event</Th>
                      <Th>Status</Th>
                      <Th align="right">Positions</Th>
                      <Th align="right">Planned</Th>
                      <Th align="right">Rostered</Th>
                      <Th align="right">Est. pay</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((v) => (
                      <tr key={v.event.id} className="hover:bg-surface-2">
                        <Td>
                          <Link href={rosterHref(fortnightStart, v.event.id)} className="font-medium text-fg hover:underline">
                            {v.event.name}
                          </Link>
                          <span className="block text-xs text-muted">{formatWeekdayDate(v.event.date)}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={rosterStatus(v)} />
                        </Td>
                        <Td align="right" className={cn(v.staffing.filled < v.staffing.needed && "text-warning")}>
                          {v.staffing.filled}/{v.staffing.needed}
                        </Td>
                        <Td align="right">{formatHours(v.plannedHours)}</Td>
                        <Td align="right">{formatHours(v.hours)}</Td>
                        <Td align="right" className="font-medium">
                          {money.format(v.cost)}
                          {v.missingLevels.length > 0 && <span className="block text-xs font-normal text-warning">+{v.missingLevels.length} unpriced</span>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </>
        )}
      </Card>
    </>
  );
}
