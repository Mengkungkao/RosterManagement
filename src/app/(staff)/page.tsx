"use client";

import { useState } from "react";
import { DAYS, type Day, type DayAvailability, type DayStatus, TIME_PATTERN, type WeekAvailability } from "@/lib/availability";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/feedback";
import StaffAccessGate, { type StaffAccessProps } from "./StaffAccessGate";
import TimeOff from "./StaffRequests";

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// A 24-hour strip (06:00 ticks) with the free time filled in, so the week
// reads at a glance. Overnight hours run to midnight and carry on next day.
function DayBar({ day, unset }: { day: DayAvailability; unset: boolean }) {
  const blocks: [number, number][] = [];
  if (!unset && day.status === "available_all_day") blocks.push([0, 1440]);
  if (!unset && day.status === "custom" && TIME_PATTERN.test(day.startTime) && TIME_PATTERN.test(day.endTime)) {
    const s = minutes(day.startTime);
    const e = minutes(day.endTime);
    if (e > s) blocks.push([s, e]);
    else if (e < s) blocks.push([s, 1440]);
  }
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
      {[360, 720, 1080].map((t) => (
        <span key={t} className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${(t / 1440) * 100}%` }} />
      ))}
      {blocks.map(([s, e]) => (
        <span key={s} className="absolute inset-y-0 rounded-full bg-success" style={{ left: `${(s / 1440) * 100}%`, width: `${((e - s) / 1440) * 100}%` }} />
      ))}
    </div>
  );
}

function describe(day: DayAvailability, unset: boolean): { text: string; tone: string } {
  if (unset) return { text: "Not set", tone: "text-subtle" };
  if (day.status === "available_all_day") return { text: "Available all day", tone: "text-success" };
  if (day.status === "custom") {
    const overnight = TIME_PATTERN.test(day.startTime) && TIME_PATTERN.test(day.endTime) && minutes(day.endTime) < minutes(day.startTime);
    return { text: `${day.startTime}–${day.endTime}${overnight ? " (next day)" : ""}`, tone: "text-success" };
  }
  return { text: "Unavailable", tone: "text-muted" };
}

function AvailabilityForm({ name, password, initialWeek, initialSet, initialRequests, reset, lock }: StaffAccessProps) {
  const toast = useToast();
  const [week, setWeek] = useState<WeekAvailability>(initialWeek);
  const [touched, setTouched] = useState<Set<Day>>(new Set());
  const [requests, setRequests] = useState(initialRequests);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [set, setSet] = useState(initialSet);
  const unset = (day: Day) => !set && !touched.has(day);
  const badTimes = DAYS.filter((d) => week[d].status === "custom" && (!TIME_PATTERN.test(week[d].startTime) || !TIME_PATTERN.test(week[d].endTime) || week[d].startTime === week[d].endTime));

  function change(day: Day, next: DayAvailability) {
    setWeek((prev) => ({ ...prev, [day]: next }));
    setTouched((t) => new Set(t).add(day));
    setSavedAt(null);
  }

  function setStatus(day: Day, status: DayStatus) {
    const prev = week[day];
    change(day, status === "custom" ? { status, startTime: prev.startTime || "09:00", endTime: prev.endTime || "17:00" } : { status, startTime: "", endTime: "" });
  }

  function copyToWeekdays() {
    const monday = week.Monday;
    setWeek((prev) => ({ ...prev, Tuesday: { ...monday }, Wednesday: { ...monday }, Thursday: { ...monday }, Friday: { ...monday } }));
    setTouched((t) => new Set([...t, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as Day[]));
    setSavedAt(null);
  }

  async function save() {
    if (badTimes.length) {
      setError(`Check the hours for ${badTimes.join(", ")}: “From” and “To” must both be set and different.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, week, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        // Someone changed this name's password since we unlocked it.
        lock(data.error || "Incorrect password.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Couldn't save your availability. Please try again.");
      setSet(true);
      setSavedAt(new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }));
      toast.success("Availability saved. Your manager will roster you within these times.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your availability. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-2">
          Signed in as <span className="font-medium text-fg">{name}</span>
        </p>
        <Button size="sm" variant="ghost" onClick={reset}>
          Not you?
        </Button>
      </div>

      {!set && (
        <Alert tone="info" className="mt-3" title="You haven't set your availability yet">
          Choose each day below. Days you leave as “Not set” are saved as unavailable.
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Your usual week</h2>
        <Button size="sm" variant="ghost" icon="copy" onClick={copyToWeekdays}>
          Copy Monday to weekdays
        </Button>
      </div>
      <p className="mt-0.5 text-xs text-muted">It repeats every week. Overnight works too, e.g. 22:00 to 06:00.</p>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {DAYS.map((day) => {
          const d = week[day];
          const info = describe(d, unset(day));
          return (
            <li key={day} className="px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="w-28 shrink-0">
                  <p className="font-medium text-fg">{day}</p>
                  <p className={cn("text-xs tabular-nums", info.tone)}>{info.text}</p>
                </div>
                <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
                  <DayBar day={d} unset={unset(day)} />
                  <div className="mt-0.5 flex justify-between text-[10px] text-subtle tabular-nums" aria-hidden="true">
                    <span>00</span>
                    <span>06</span>
                    <span>12</span>
                    <span>18</span>
                    <span>24</span>
                  </div>
                </div>
                <Segmented<DayStatus>
                  label={`${day} availability`}
                  size="sm"
                  className="ml-auto sm:ml-0"
                  value={unset(day) ? ("none" as DayStatus) : d.status}
                  onChange={(v) => setStatus(day, v)}
                  options={[
                    { value: "unavailable", label: "Off" },
                    { value: "available_all_day", label: "All day" },
                    { value: "custom", label: "Hours" },
                  ]}
                />
              </div>
              {d.status === "custom" && !unset(day) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:pl-32">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    From
                    <Input type="time" value={d.startTime} onChange={(e) => change(day, { ...d, startTime: e.target.value })} className="w-32" aria-label={`${day} from`} />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    To
                    <Input type="time" value={d.endTime} onChange={(e) => change(day, { ...d, endTime: e.target.value })} className="w-32" aria-label={`${day} to`} />
                  </label>
                  {badTimes.includes(day) && <span className="text-xs text-danger">Set different From and To times</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <Alert tone="danger" className="mt-3" role="alert">
          {error}
        </Alert>
      )}
      <div className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <Button variant="primary" icon="check" loading={saving} onClick={save} className="h-10 flex-1 sm:flex-none">
          Save availability
        </Button>
        {savedAt && <span className="text-xs text-success" role="status">Saved at {savedAt}</span>}
      </div>

      <TimeOff name={name} password={password} requests={requests} onChange={setRequests} lock={lock} />
    </>
  );
}

export default function AvailabilityPage() {
  return (
    <Card className="p-5 sm:p-6">
      <h1 className="text-xl font-semibold text-fg">Your availability</h1>
      <p className="mt-1 text-sm text-muted">Tell your manager when you can work. You&apos;re only rostered within these times.</p>
      <StaffAccessGate>{(access) => <AvailabilityForm {...access} />}</StaffAccessGate>
    </Card>
  );
}
