"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AWARD_LEVELS,
  AWARD_LEVEL_EXAMPLES,
  AWARD_LEVEL_NAMES,
  type AwardLevel,
  DEFAULT_RATES_FROM,
  PAY_GUIDE_URL,
} from "@/lib/award";
import { formatWeekdayDate, isValidDate } from "@/lib/dates";
import type { PaySettings } from "@/lib/settings";
import { input, label, messageClass, mutedText, primaryButton, secondaryButton } from "../../ui";
import { send } from "../api";

type Message = { type: "success" | "error"; text: string } | null;

function MoneyField({ title, hint, value, onChange }: { title: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      <div className="mt-1 flex items-center gap-1">
        <span className={mutedText}>$</span>
        <input
          type="number"
          min={0.01}
          step={0.01}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-28 ${input}`}
        />
      </div>
      {hint && <span className={`mt-0.5 block text-xs ${mutedText}`}>{hint}</span>}
    </label>
  );
}

export default function PaySettingsForm({ settings }: { settings: PaySettings }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [fortnightStart, setFortnightStart] = useState(settings.fortnightStart);
  const [publicHolidays, setPublicHolidays] = useState(settings.publicHolidays);
  const [newHoliday, setNewHoliday] = useState("");
  const [rates, setRates] = useState<Record<AwardLevel, string>>(
    () => Object.fromEntries(AWARD_LEVELS.map((l) => [l, String(settings.awardRates[l])])) as Record<AwardLevel, string>
  );
  const [eveningLoading, setEveningLoading] = useState(String(settings.eveningLoading));
  const [nightLoading, setNightLoading] = useState(String(settings.nightLoading));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await send("/api/admin/settings", "PUT", {
      fortnightStart,
      publicHolidays,
      awardRates: rates,
      eveningLoading,
      nightLoading,
    });
    setSaving(false);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "success", text: "Pay settings saved." });
    startRefresh(() => router.refresh());
  }

  return (
    <form onSubmit={save}>
      <p className={`text-sm ${mutedText}`}>
        Used for the wage estimates. Saved in the Settings tab of the Google Sheet. Estimates only — not a payroll
        result; check anything unusual with the Fair Work pay calculator.
      </p>

      <div className="mt-4 flex flex-wrap gap-6">
        <label>
          <span className={label}>A fortnight starts on</span>
          <input
            type="date"
            value={fortnightStart}
            onChange={(e) => setFortnightStart(e.target.value)}
            className={`mt-1 ${input}`}
          />
          {isValidDate(fortnightStart) && (
            <span className={`mt-1 block text-xs ${mutedText}`}>
              {formatWeekdayDate(fortnightStart)} — any start of a pay fortnight
            </span>
          )}
        </label>

        <div>
          <span className={label}>Public holidays (Victoria — add each one)</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {publicHolidays.length === 0 && <span className={`text-sm ${mutedText}`}>None yet.</span>}
            {publicHolidays.map((date) => (
              <span key={date} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-sm dark:bg-zinc-800">
                {formatWeekdayDate(date)} {date.slice(0, 4)}
                <button
                  type="button"
                  onClick={() => setPublicHolidays(publicHolidays.filter((d) => d !== date))}
                  className="text-zinc-400 hover:text-red-600"
                  aria-label={`Remove ${date}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} className={input} />
            <button
              type="button"
              disabled={!isValidDate(newHoliday) || publicHolidays.includes(newHoliday)}
              onClick={() => {
                setPublicHolidays([...publicHolidays, newHoliday].sort());
                setNewHoliday("");
              }}
              className={secondaryButton}
            >
              Add holiday
            </button>
          </div>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-medium text-zinc-700 dark:text-zinc-300">Award rates</h3>
      <p className={`mt-1 text-xs ${mutedText}`}>
        Full-time/part-time minimum hourly rates (casual, weekend, holiday and overtime rates are worked out from
        these). Filled in from the Fair Work pay guide from {formatWeekdayDate(DEFAULT_RATES_FROM)}{" "}
        {DEFAULT_RATES_FROM.slice(0, 4)}. When rates change each 1 July, copy the new &ldquo;Hourly pay rate&rdquo;
        figures from the{" "}
        <a href={PAY_GUIDE_URL} target="_blank" rel="noreferrer" className="underline">
          pay guide
        </a>{" "}
        here.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AWARD_LEVELS.map((level) => (
          <MoneyField
            key={level}
            title={AWARD_LEVEL_NAMES[level]}
            hint={AWARD_LEVEL_EXAMPLES[level]}
            value={rates[level]}
            onChange={(v) => setRates({ ...rates, [level]: v })}
          />
        ))}
        <MoneyField title="Evening loading" hint="Mon–Fri 7pm–midnight, per hour or part" value={eveningLoading} onChange={setEveningLoading} />
        <MoneyField title="Night loading" hint="Mon–Fri midnight–7am, per hour or part" value={nightLoading} onChange={setNightLoading} />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={saving || refreshing} className={primaryButton}>
          {saving ? "Saving…" : "Save pay settings"}
        </button>
        {message && <span className={`text-sm ${messageClass(message.type)}`}>{message.text}</span>}
      </div>
    </form>
  );
}
