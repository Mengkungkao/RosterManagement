"use client";

import { addDays, formatMinutes, formatWeekdayDate } from "@/lib/dates";
import { colorForEvent } from "@/lib/event-colors";
import type { EventView } from "@/lib/overview";
import { type Shift, type TimeWindow, eventWindow, formatWindow, sameName } from "@/lib/roster";
import { card, mutedText } from "../ui";

const LABEL_WIDTH = 168;
const HOUR_WIDTH = 56;

const hatched = (color: string) => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 6px, transparent 6px 12px)`,
});

function Bar({
  window,
  range,
  className = "",
  style,
  children,
  title,
}: {
  window: TimeWindow;
  range: TimeWindow;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  title?: string;
}) {
  const span = range.end - range.start;
  const left = ((Math.max(window.start, range.start) - range.start) / span) * 100;
  const width = ((Math.min(window.end, range.end) - Math.max(window.start, range.start)) / span) * 100;
  if (width <= 0) return null;
  return (
    <div
      className={`absolute top-1 bottom-1 flex items-center overflow-hidden rounded px-1.5 text-[11px] leading-none whitespace-nowrap ${className}`}
      style={{ left: `${left}%`, width: `${width}%`, ...style }}
      title={title}
    >
      {children}
    </div>
  );
}

function Row({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex border-t border-zinc-100 dark:border-zinc-900">
      <div
        className="sticky left-0 z-10 shrink-0 bg-white px-2 py-1.5 text-xs dark:bg-zinc-950"
        style={{ width: LABEL_WIDTH }}
      >
        <div className="truncate font-medium text-zinc-800 dark:text-zinc-200">{label}</div>
        {sub && <div className={`truncate text-[11px] ${mutedText}`}>{sub}</div>}
      </div>
      <div className="relative h-9 flex-1">{children}</div>
    </div>
  );
}

// Each day of the fortnight that has events, on a time axis: every task's
// required time with gaps and unsafe team cover marked, then every person's
// shifts that day with breaks, task changes and overlaps.
export default function TimelineView({
  views,
  shifts,
  fortnightStart,
  today,
  onSelect,
}: {
  views: EventView[];
  shifts: Shift[];
  fortnightStart: string;
  today: string;
  onSelect: (id: string) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(fortnightStart, i)).filter((d) =>
    views.some((v) => v.event.date === d)
  );
  if (days.length === 0) return <p className={`mt-4 text-sm ${mutedText}`}>No events this fortnight.</p>;

  return (
    <div className="mt-4 space-y-5">
      <p className={`text-xs ${mutedText}`}>
        Solid bars are covered; <span className="font-medium text-red-700 dark:text-red-400">hatched red</span> is
        short of people; <span className="font-medium text-amber-700 dark:text-amber-400">hatched amber</span> is team
        work without a full team; ⚠ marks a person on two things at once. Scroll sideways on small screens.
      </p>
      {days.map((date) => {
        const dayViews = views.filter((v) => v.event.date === date);
        const dayShifts = shifts.filter((s) => s.date === date);
        const start = Math.floor(Math.min(...dayViews.map((v) => v.span.start), ...dayShifts.map((s) => s.start)) / 60) * 60;
        const end = Math.ceil(Math.max(...dayViews.map((v) => v.span.end), ...dayShifts.map((s) => s.end)) / 60) * 60;
        const range = { start, end: Math.max(end, start + 60) };
        const hours = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, i) => range.start + i * 60);
        const people = [...new Set(dayShifts.map((s) => s.staffName.trim()))];
        const width = LABEL_WIDTH + (hours.length - 1) * HOUR_WIDTH;

        return (
          <section key={date} className={`${card} overflow-hidden`}>
            <h3 className="px-3 pt-3 pb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {formatWeekdayDate(date)}
              {date === today && <span className={`ml-2 font-normal ${mutedText}`}>today</span>}
            </h3>
            <div className="overflow-x-auto">
              <div style={{ minWidth: width }}>
                <div className="flex">
                  <div className="sticky left-0 z-10 shrink-0 bg-white dark:bg-zinc-950" style={{ width: LABEL_WIDTH }} />
                  <div className="relative h-5 flex-1">
                    {hours.map((h, i) => (
                      <span
                        key={h}
                        className={`absolute text-[10px] tabular-nums ${mutedText} ${
                          i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
                        }`}
                        style={{ left: `${((h - range.start) / (range.end - range.start)) * 100}%` }}
                      >
                        {formatMinutes(h)}
                      </span>
                    ))}
                  </div>
                </div>

                {dayViews.map((v) => (
                  <div key={v.event.id}>
                    <Row
                      label={
                        <button type="button" onClick={() => onSelect(v.event.id)} className="truncate text-left hover:underline">
                          {v.event.name}
                          {v.event.status === "draft" && <span className={`ml-1 font-normal ${mutedText}`}>(draft)</span>}
                        </button>
                      }
                      sub={`${v.staffing.filled}/${v.staffing.needed} positions`}
                    >
                      <Bar window={v.span} range={range} className="bg-zinc-100 dark:bg-zinc-900" title="Setup to pack-down" />
                      <Bar
                        window={eventWindow(v.event)}
                        range={range}
                        className={`${colorForEvent(v.event.id)} font-medium`}
                        title={`Event ${v.event.startTime}–${v.event.endTime}`}
                      >
                        Event {v.event.startTime}–{v.event.endTime}
                      </Bar>
                    </Row>
                    {v.statuses.map((s) => (
                      <Row key={s.task.id} label={<span className="font-normal">{s.task.name}</span>} sub={`${s.covered}/${s.task.count} · ${formatWindow(s.window)}`}>
                        <Bar
                          window={s.window}
                          range={range}
                          className={s.covered >= s.task.count ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}
                          title={`${s.task.name} ${formatWindow(s.window)}: ${s.covered} of ${s.task.count}`}
                        >
                          {s.short.length === 0 && s.unsafe.length === 0 && `${s.covered}/${s.task.count}`}
                        </Bar>
                        {s.short.map((gap) => (
                          <Bar
                            key={`short-${gap.start}`}
                            window={gap}
                            range={range}
                            className="border border-red-400 text-red-800 dark:border-red-700 dark:text-red-200"
                            style={hatched("rgba(239,68,68,0.35)")}
                            title={`Short of people ${formatWindow(gap)}`}
                          >
                            short
                          </Bar>
                        ))}
                        {s.unsafe.map((gap) => (
                          <Bar
                            key={`unsafe-${gap.start}`}
                            window={gap}
                            range={range}
                            className="border border-amber-500 text-amber-900 dark:text-amber-200"
                            style={hatched("rgba(245,158,11,0.4)")}
                            title={`Team of ${s.task.minTeam} needed ${formatWindow(gap)}`}
                          >
                            team!
                          </Bar>
                        ))}
                      </Row>
                    ))}
                  </div>
                ))}

                {people.length > 0 && (
                  <div className="border-t-2 border-zinc-200 dark:border-zinc-800">
                    <div className={`px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase ${mutedText}`}>Staff on shift</div>
                    {people.map((name) => {
                      const own = dayShifts.filter((s) => sameName(s.staffName, name)).sort((a, b) => a.start - b.start);
                      const total = own.length;
                      return (
                        <Row key={name} label={name} sub={`${total} ${total === 1 ? "shift" : "shifts"}`}>
                          {own.map((s, i) => {
                            const overlaps = own.some((o, j) => j !== i && o.start < s.end && s.start < o.end);
                            return (
                              <Bar
                                key={`${s.eventId}-${s.taskId}-${s.start}`}
                                window={s}
                                range={range}
                                className={`${colorForEvent(s.eventId)} ${overlaps ? "border-2 border-dashed border-amber-600" : ""}`}
                                title={`${s.eventName} · ${s.taskName} ${formatWindow(s)}${overlaps ? " — overlaps another shift" : ""}`}
                              >
                                {overlaps && "⚠ "}
                                {s.taskName || s.eventName}
                              </Bar>
                            );
                          })}
                          {[...new Map(own.flatMap((s) => s.breaks).map((b) => [b.start, b])).values()].map((b) => (
                            <Bar
                              key={`break-${b.start}`}
                              window={b}
                              range={range}
                              className="justify-center bg-white text-[10px] text-zinc-500 ring-1 ring-zinc-300 dark:bg-zinc-950 dark:ring-zinc-700"
                              title={`Unpaid break ${formatWindow(b)}`}
                            >
                              break
                            </Bar>
                          ))}
                        </Row>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
