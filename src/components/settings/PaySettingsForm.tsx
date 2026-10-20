"use client";

import { useState } from "react";
import { AWARD_LEVELS, AWARD_LEVEL_EXAMPLES, AWARD_LEVEL_NAMES, type AwardLevel, DEFAULT_RATES_FROM, PAY_GUIDE_URL } from "@/lib/award";
import { formatWeekdayDate, isValidDate } from "@/lib/dates";
import type { PaySettings } from "@/lib/settings";
import { Button, IconButton } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { SaveBar } from "./SaveBar";
import { useSaver } from "./useSaver";

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted">$</span>
      <Input type="number" min={0.01} step={0.01} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="pl-6 tabular-nums" />
    </div>
  );
}

const money = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0;

export default function PaySettingsForm({ settings }: { settings: PaySettings }) {
  const initial = {
    fortnightStart: settings.fortnightStart,
    publicHolidays: settings.publicHolidays,
    rates: Object.fromEntries(AWARD_LEVELS.map((l) => [l, String(settings.awardRates[l])])) as Record<AwardLevel, string>,
    eveningLoading: String(settings.eveningLoading),
    nightLoading: String(settings.nightLoading),
  };
  const [form, setForm] = useState(initial);
  const [newHoliday, setNewHoliday] = useState("");
  const [tried, setTried] = useState(false);
  const { save, saving, error } = useSaver();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const invalid = !isValidDate(form.fortnightStart) || !AWARD_LEVELS.every((l) => money(form.rates[l])) || !money(form.eveningLoading) || !money(form.nightLoading);

  return (
    <div>
      <p className="mb-4 text-[13px] text-muted">
        Used for the wage estimates only — not a payroll result. Saved in the Settings tab of the Google Sheet.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Field
          label="A pay fortnight starts on"
          error={tried && !isValidDate(form.fortnightStart) ? "Choose a date" : undefined}
          hint={isValidDate(form.fortnightStart) ? `${formatWeekdayDate(form.fortnightStart)} — any start of a pay fortnight` : undefined}
        >
          <Input type="date" value={form.fortnightStart} onChange={(e) => setForm({ ...form, fortnightStart: e.target.value })} className="max-w-56" />
        </Field>
        <div>
          <p className="mb-1 text-[13px] font-medium text-fg-2">Public holidays (add each one for your state)</p>
          {form.publicHolidays.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {form.publicHolidays.map((date) => (
                <li key={date} className="flex items-center gap-1 rounded-md border border-line bg-surface-2 py-0.5 pr-0.5 pl-2 text-[13px] text-fg-2">
                  {formatWeekdayDate(date)} {date.slice(0, 4)}
                  <IconButton icon="x" size="sm" className="h-6 w-6" label={`Remove ${date}`} onClick={() => setForm({ ...form, publicHolidays: form.publicHolidays.filter((d) => d !== date) })} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} aria-label="Public holiday to add" className="max-w-48" />
            <Button
              icon="plus"
              disabled={!isValidDate(newHoliday) || form.publicHolidays.includes(newHoliday)}
              onClick={() => {
                setForm({ ...form, publicHolidays: [...form.publicHolidays, newHoliday].sort() });
                setNewHoliday("");
              }}
            >
              Add holiday
            </Button>
          </div>
        </div>
      </div>

      <h3 className="mt-6 text-[13px] font-medium text-fg-2">Award rates (full-time / part-time hourly)</h3>
      <p className="mt-0.5 text-xs text-muted">
        Casual, weekend, holiday and overtime rates are worked out from these. Filled in from the Fair Work pay guide from{" "}
        {formatWeekdayDate(DEFAULT_RATES_FROM)} {DEFAULT_RATES_FROM.slice(0, 4)}. When rates change each 1 July, copy the new “Hourly pay rate”
        figures from the{" "}
        <a href={PAY_GUIDE_URL} target="_blank" rel="noreferrer" className="text-primary-text underline">
          pay guide
        </a>
        .
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AWARD_LEVELS.map((level) => (
          <Field key={level} label={AWARD_LEVEL_NAMES[level]} hint={AWARD_LEVEL_EXAMPLES[level]} error={tried && !money(form.rates[level]) ? "Enter a dollar amount" : undefined}>
            <MoneyInput value={form.rates[level]} onChange={(v) => setForm({ ...form, rates: { ...form.rates, [level]: v } })} />
          </Field>
        ))}
        <Field label="Evening loading" hint="Mon–Fri 7pm–midnight, per hour or part" error={tried && !money(form.eveningLoading) ? "Enter a dollar amount" : undefined}>
          <MoneyInput value={form.eveningLoading} onChange={(v) => setForm({ ...form, eveningLoading: v })} />
        </Field>
        <Field label="Night loading" hint="Mon–Fri midnight–7am, per hour or part" error={tried && !money(form.nightLoading) ? "Enter a dollar amount" : undefined}>
          <MoneyInput value={form.nightLoading} onChange={(v) => setForm({ ...form, nightLoading: v })} />
        </Field>
      </div>

      <SaveBar
        label="Save pay settings"
        dirty={dirty}
        saving={saving}
        error={error}
        onReset={() => setForm(initial)}
        onSave={() => {
          setTried(true);
          if (invalid) return;
          save(
            "/api/admin/settings",
            { fortnightStart: form.fortnightStart, publicHolidays: form.publicHolidays, awardRates: form.rates, eveningLoading: form.eveningLoading, nightLoading: form.nightLoading },
            "Pay settings saved."
          );
        }}
      />
    </div>
  );
}
