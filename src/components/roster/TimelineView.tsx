"use client";

import { addDays, formatMinutes, formatWeekdayDate } from "@/lib/dates";
import { colorForEvent } from "@/lib/event-colors";
import type { EventView } from "@/lib/overview";
import { type Shift, type TaskStatus, type TimeWindow, eventWindow, formatWindow, sameName } from "@/lib/roster";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { cn } from "../ui/cn";

const LABEL_WIDTH = 190;
const HOUR_WIDTH = 64;

function Bar({
  window,
  range,
  className = "",
  children,
  title,
  onClick,
}: {
  window: TimeWindow;
  range: TimeWindow;
  className?: string;
  children?: React.ReactNode;
  title?: string;
  onClick?: () => void;
}) {
  const span = range.end - range.start;
  const left = ((Math.max(window.start, range.start) - range.start) / span) * 100;
  const width = ((Math.min(window.end, range.end) - Math.max(window.start, range.start)) / span) * 100;
  if (width <= 0) return null;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn("absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded px-1.5 text-left text-[11px] leading-none font-medium whitespace-nowrap", className)}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      {children}
    </Tag>
  );
}

function Row({ label, sub, children, onLabel }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; onLabel?: () => void }) {
  return (
    <div className="flex border-t border-line">
      <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface px-3 py-1.5" style={{ width: LABEL_WIDTH }}>
        {onLabel ? (
          <button type="button" onClick={onLabel} className="block w-full truncate text-left text-xs font-medium text-fg hover:underline">
            {label}
          </button>
        ) : (
          <div className="truncate text-xs font-medium text-fg">{label}</div>
        )}
        {sub && <div className="truncate text-[11px] text-muted tabular-nums">{sub}</div>}
      </div>
      <div className="relative h-10 flex-1">{children}</div>
    </div>
  );
}

function TaskRow({ s, range, onOpen }: { s: TaskStatus; range: TimeWindow; onOpen: () => void }) {
  const ok = s.covered >= s.task.count && s.unsafe.length === 0;
  return (
    <Row label={s.task.name} sub={`${s.covered}/${s.task.count} · ${formatWindow(s.window)}`} onLabel={onOpen}>
      <Bar
        window={s.window}
        range={range}
        onClick={onOpen}
        className={ok ? "border border-success-line bg-success-soft text-success" : "border border-line bg-surface-3 text-fg-2"}
        title={`${s.task.name} ${formatWindow(s.window)}: ${s.covered} of ${s.task.count}`}
      >
        {ok ? "✓ " : ""}
        {s.covered}/{s.task.count}
      </Bar>
      {s.short.map((gap) => (
        <Bar key={`short-${gap.start}`} window={gap} range={range} onClick={onOpen} className="hatch-danger border border-danger-line text-danger" title={`Short of people ${formatWindow(gap)}`}>
          <span className="rounded-sm bg-surface px-1 py-0.5">short {formatWindow(gap)}</span>
        </Bar>
      ))}
      {s.unsafe.map((gap) => (
        <Bar key={`unsafe-${gap.start}`} window={gap} range={range} onClick={onOpen} className="hatch-warning border border-warning-line text-warning" title={`Team of ${s.task.minTeam} needed ${formatWindow(gap)}`}>
          <span className="rounded-sm bg-surface px-1 py-0.5">team incomplete</span>
        </Bar>
      ))}
    </Row>
  );
}

// Each day with events on a time axis: every task's time with gaps and
// incomplete teams marked, then each person's shifts with task changes,
// breaks and overlaps.
export default function TimelineView({
  views,
  shifts,
  days,
  today,
  onOpenTask,
  staffName,
}: {
  views: EventView[];
  shifts: Shift[];
  days: string[];
  today: string;
  onOpenTask: (eventId: string, taskId: string) => void;
  staffName: string;
}) {
  const shown = days.filter((d) => views.some((v) => v.event.date === d));
  if (shown.length === 0) {
    return (
      <Card>
        <EmptyState icon="timeline" title="No events to show">
          Nothing matches this period and these filters.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-success-line bg-success-soft" /> Covered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="hatch-danger h-3 w-5 rounded-sm border border-danger-line" /> Short of people
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="hatch-warning h-3 w-5 rounded-sm border border-warning-line" /> Team incomplete
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border-2 border-dashed border-warning" /> Two things at once
        </span>
        <span>Scroll sideways on small screens.</span>
      </p>
      {shown.map((date) => {
        const dayViews = views.filter((v) => v.event.date === date);
        const ids = new Set(dayViews.map((v) => v.event.id));
        const dayShifts = shifts.filter((s) => s.date === date && ids.has(s.eventId) && (!staffName || sameName(s.staffName, staffName)));
        const start = Math.floor(Math.min(...dayViews.map((v) => v.span.start), ...dayShifts.map((s) => s.start)) / 60) * 60;
        const end = Math.ceil(Math.max(...dayViews.map((v) => v.span.end), ...dayShifts.map((s) => s.end)) / 60) * 60;
        const range = { start, end: Math.max(end, start + 60) };
        const hours = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, i) => range.start + i * 60);
        const people = [...new Set(dayShifts.map((s) => s.staffName.trim()))];
        const width = LABEL_WIDTH + (hours.length - 1) * HOUR_WIDTH;
        const pct = (m: number) => `${((m - range.start) / (range.end - range.start)) * 100}%`;

        return (
          <Card key={date} className="overflow-hidden">
            <h3 className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-fg">
              {formatWeekdayDate(date)}
              {date === today && <span className="rounded bg-primary-soft px-1.5 text-xs font-medium text-primary-text">Today</span>}
              {date === addDays(today, 1) && <span className="text-xs font-normal text-muted">Tomorrow</span>}
            </h3>
            <div className="overflow-x-auto">
              <div style={{ minWidth: width }} className="relative">
                <div className="flex border-t border-line bg-surface-2">
                  <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface-2" style={{ width: LABEL_WIDTH }} />
                  <div className="relative h-7 flex-1">
                    {hours.map((h, i) => (
                      <span
                        key={h}
                        className={cn(
                          "absolute top-1.5 text-[11px] text-muted tabular-nums",
                          i === 0 ? "pl-1" : i === hours.length - 1 ? "-translate-x-full pr-1" : "-translate-x-1/2"
                        )}
                        style={{ left: pct(h) }}
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
                        <>
                          {v.event.name}
                          {v.event.status === "draft" && <span className="ml-1 font-normal text-muted">(draft)</span>}
                        </>
                      }
                      sub={`${v.staffing.filled}/${v.staffing.needed} positions${v.event.location ? ` · ${v.event.location}` : ""}`}
                    >
                      <Bar window={v.span} range={range} className="border border-dashed border-line-strong text-muted" title="Setup to pack-down">
                        {v.span.start < eventWindow(v.event).start ? "setup" : ""}
                      </Bar>
                      <Bar window={eventWindow(v.event)} range={range} className={colorForEvent(v.event.id)} title={`Event ${v.event.startTime}–${v.event.endTime}`}>
                        Event {v.event.startTime}–{v.event.endTime}
                      </Bar>
                    </Row>
                    {v.statuses.map((s) => (
                      <TaskRow key={s.task.id} s={s} range={range} onOpen={() => onOpenTask(v.event.id, s.task.id)} />
                    ))}
                  </div>
                ))}

                {people.length > 0 && (
                  <>
                    <div className="border-t-2 border-line-strong bg-surface-2 px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                      Staff on shift · {people.length}
                    </div>
                    {people.map((name) => {
                      const own = dayShifts.filter((s) => sameName(s.staffName, name)).sort((a, b) => a.start - b.start);
                      const breaks = [...new Map(own.flatMap((s) => s.breaks).map((b) => [b.start, b])).values()];
                      return (
                        <Row key={name} label={name} sub={`${own.length} ${own.length === 1 ? "shift" : "shifts"}`}>
                          {own.map((s, i) => {
                            const overlaps = own.some((o, j) => j !== i && o.start < s.end && s.start < o.end);
                            return (
                              <Bar
                                key={`${s.eventId}-${s.taskId}-${s.start}`}
                                window={s}
                                range={range}
                                onClick={() => onOpenTask(s.eventId, s.taskId)}
                                className={cn(colorForEvent(s.eventId), overlaps && "border-2 border-dashed border-warning")}
                                title={`${s.eventName} · ${s.taskName} ${formatWindow(s)}${overlaps ? " — at the same time as another shift" : ""}`}
                              >
                                {overlaps && "⚠ "}
                                {s.taskName || s.eventName}
                              </Bar>
                            );
                          })}
                          {breaks.map((b) => (
                            <Bar key={`break-${b.start}`} window={b} range={range} className="justify-center bg-surface text-[10px] font-normal text-muted ring-1 ring-line-strong" title={`Unpaid break ${formatWindow(b)}`}>
                              break
                            </Bar>
                          ))}
                        </Row>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
