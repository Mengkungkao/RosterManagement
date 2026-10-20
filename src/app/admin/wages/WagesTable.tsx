"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AWARD_LEVEL_NAMES, AWARD_NAME, PAY_CALCULATOR_URL, PAY_GUIDE_URL } from "@/lib/award";
import { addDays, formatHours, formatWeekdayDate } from "@/lib/dates";
import type { EventRecord } from "@/lib/events";
import { EMPLOYMENT_LABELS } from "@/lib/employment";
import type { WageLine, WageSummary } from "@/lib/wages";
import { card, linkButton, mutedText, secondaryButton, warningText } from "../../ui";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

function typeLabel(line: WageLine): string {
  return line.employmentType === "student" ? "Student (casual)" : EMPLOYMENT_LABELS[line.employmentType];
}

function toCsv(lines: WageLine[]): string {
  const rows: (string | number)[][] = [["Name", "Type", "Award level", "Item", "Hours", "Rate", "Amount"]];
  for (const l of lines) {
    const level = l.awardLevel ? AWARD_LEVEL_NAMES[l.awardLevel] : "not set";
    for (const item of l.items) {
      rows.push([l.staffName, typeLabel(l), level, item.label, item.hours, item.rate, item.amount]);
    }
    rows.push([l.staffName, typeLabel(l), level, "Total", l.workedHours, "", l.pay ?? ""]);
  }
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Breakdown({ line }: { line: WageLine }) {
  return (
    <div className="grid gap-4 px-4 pb-4 text-xs sm:grid-cols-2">
      <table className="w-full">
        <thead>
          <tr className={`text-left ${mutedText}`}>
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
          <tr className={`text-left ${mutedText}`}>
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

export default function WagesTable({
  summary,
  events,
  fortnightStart,
  ratesOutOfDate,
}: {
  summary: WageSummary;
  events: EventRecord[];
  fortnightStart: string;
  ratesOutOfDate: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rostered = summary.lines.filter((l) => l.workedHours > 0);

  return (
    <section className="mt-4">
      <p className={`mb-3 text-sm ${mutedText}`}>
        Minimum pay under the {AWARD_NAME}: weekday, Saturday, Sunday and public holiday rates, the Monday–Friday
        evening (7pm–midnight) and night (midnight–7am) loadings, overtime, and minimum paid hours. Casuals and
        students get the casual rates. Unpaid 30-minute breaks are taken out. Check against the Fair Work{" "}
        <a href={PAY_GUIDE_URL} target="_blank" rel="noreferrer" className="underline">
          pay guides
        </a>{" "}
        or{" "}
        <a href={PAY_CALCULATOR_URL} target="_blank" rel="noreferrer" className="underline">
          pay calculator
        </a>
        .
      </p>
      {ratesOutOfDate && (
        <p className={`mb-3 text-sm ${warningText}`}>
          This fortnight is after 30 June, when award rates usually go up. Check the latest pay guide and update the
          rates in{" "}
          <Link href="/admin/settings#pay" className="underline">
            Settings → Pay and award
          </Link>
          .
        </p>
      )}
      {summary.missingLevels.length > 0 && (
        <p className={`mb-3 text-sm ${warningText}`}>
          No award level for {summary.missingLevels.join(", ")} — their pay isn&apos;t counted. Set it on the{" "}
          <Link href="/admin/staff" className="underline">
            Staff
          </Link>{" "}
          tab.
        </p>
      )}
      {rostered.length === 0 ? (
        <p className={`text-sm ${mutedText}`}>No one is rostered this fortnight.</p>
      ) : (
        <div className={`overflow-x-auto ${card}`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className={`border-b border-zinc-200 text-left dark:border-zinc-800 ${mutedText}`}>
                <th className="px-4 py-2.5 font-medium">Staff</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Award level</th>
                <th className="px-3 py-2.5 text-right font-medium">Shifts</th>
                <th className="px-3 py-2.5 text-right font-medium">Hours worked</th>
                <th className="px-3 py-2.5 text-right font-medium">Pay</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rostered.map((line) => (
                <Fragment key={line.staffName}>
                  <tr className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">{line.staffName}</td>
                    <td className={`px-3 py-2 ${mutedText}`}>{typeLabel(line)}</td>
                    <td className="px-3 py-2">
                      {line.awardLevel ? (
                        `${AWARD_LEVEL_NAMES[line.awardLevel]} · ${money.format(line.baseRate!)}`
                      ) : (
                        <span className={warningText}>not set</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{line.days.length}</td>
                    <td className="px-3 py-2 text-right">{formatHours(line.workedHours)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {line.pay === null ? "–" : money.format(line.pay)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen(open === line.staffName ? null : line.staffName)}
                        className={linkButton}
                      >
                        {open === line.staffName ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {open === line.staffName && (
                    <tr>
                      <td colSpan={7}>
                        {line.pay === null ? (
                          <p className={`px-4 pb-4 text-xs ${mutedText}`}>Set an award level to see the pay breakdown.</p>
                        ) : (
                          <Breakdown line={line} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t border-zinc-200 font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
                <td className="px-4 py-2.5" colSpan={4}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right">{formatHours(summary.totalHours)}</td>
                <td className="px-3 py-2.5 text-right">{money.format(summary.totalPay)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {events.some((e) => summary.byEvent[e.id]) && (
        <div className={`mt-6 overflow-x-auto ${card}`}>
          <table className="w-full min-w-[480px] text-sm">
            <caption className={`px-4 pt-3 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200`}>
              By event <span className={`font-normal ${mutedText}`}>· time on two functions at once is split between them</span>
            </caption>
            <thead>
              <tr className={`border-b border-zinc-200 text-left dark:border-zinc-800 ${mutedText}`}>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-3 py-2.5 text-right font-medium">Hours</th>
                <th className="px-3 py-2.5 text-right font-medium">Est. pay</th>
                <th className="px-4 py-2.5 font-medium">Not included</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {events
                .filter((e) => summary.byEvent[e.id])
                .map((e) => {
                  const share = summary.byEvent[e.id];
                  return (
                    <tr key={e.id} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-4 py-2">
                        {e.name} <span className={mutedText}>· {formatWeekdayDate(e.date)}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{formatHours(share.hours)}</td>
                      <td className="px-3 py-2 text-right">{money.format(share.pay)}</td>
                      <td className={`px-4 py-2 text-xs ${share.missingLevels.length ? warningText : mutedText}`}>
                        {share.missingLevels.length ? `${share.missingLevels.join(", ")} (no award level)` : "–"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xs ${mutedText}`}>
          Before tax and super. Not included: junior and apprentice rates, allowances, paid rest breaks taken as time
          off, and anything an enterprise agreement changes. Overtime counts from 11.5h a day (12h for casuals) or 76h
          a fortnight.
        </p>
        {rostered.length > 0 && (
          <button
            type="button"
            onClick={() => download(`wages-${fortnightStart}-to-${addDays(fortnightStart, 13)}.csv`, toCsv(rostered))}
            className={secondaryButton}
          >
            Download CSV
          </button>
        )}
      </div>
    </section>
  );
}
