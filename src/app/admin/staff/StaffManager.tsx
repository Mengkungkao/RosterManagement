"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AWARD_LEVELS, AWARD_LEVEL_EXAMPLES, AWARD_LEVEL_NAMES, type AwardLevel } from "@/lib/award";
import { DAYS, type DayAvailability } from "@/lib/availability";
import { EMPLOYMENT_LABELS, EMPLOYMENT_RULES, EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/employment";
import type { StaffMember } from "@/lib/staff";
import { card, input, label, linkButton, messageClass, mutedText, primaryButton, secondaryButton } from "../../ui";

type Message = { type: "success" | "error"; text: string } | null;
type Draft = { employmentType: EmploymentType; awardLevel: AwardLevel | "" };

function dayChip(day: DayAvailability) {
  if (day.status === "available_all_day") {
    return { text: "All day", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  }
  if (day.status === "custom") {
    return {
      text: `${day.startTime}–${day.endTime}`,
      tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    };
  }
  return { text: "Off", tone: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500" };
}

function TypeSelect({ value, onChange }: { value: EmploymentType; onChange: (value: EmploymentType) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as EmploymentType)} className={`${input} py-1.5`}>
      {EMPLOYMENT_TYPES.map((type) => (
        <option key={type} value={type}>
          {EMPLOYMENT_LABELS[type]}
        </option>
      ))}
    </select>
  );
}

function LevelSelect({
  value,
  rates,
  onChange,
}: {
  value: AwardLevel | "";
  rates: Record<AwardLevel, number>;
  onChange: (value: AwardLevel | "") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AwardLevel | "")}
      className={`${input} py-1.5`}
      title={value ? AWARD_LEVEL_EXAMPLES[value] : "Choose their award level"}
    >
      <option value="">Award level…</option>
      {AWARD_LEVELS.map((level) => (
        <option key={level} value={level}>
          {AWARD_LEVEL_NAMES[level]} · ${rates[level].toFixed(2)}
        </option>
      ))}
    </select>
  );
}

const toDraft = (s: StaffMember): Draft => ({
  employmentType: s.employmentType,
  awardLevel: s.awardLevel ?? "",
});

export default function StaffManager({
  staff,
  rates,
}: {
  staff: StaffMember[];
  rates: Record<AwardLevel, number>;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newName, setNewName] = useState("");
  const [newDraft, setNewDraft] = useState<Draft>({ employmentType: "casual", awardLevel: "" });

  async function send(key: string, method: "POST" | "PATCH", body: unknown, success: string) {
    setSaving(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setMessage({ type: "success", text: success });
      startRefresh(() => router.refresh());
      return true;
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Couldn't save" });
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function saveRow(person: StaffMember) {
    const draft = drafts[person.staffName];
    const ok = await send(
      person.staffName,
      "PATCH",
      { name: person.staffName, employmentType: draft.employmentType, awardLevel: draft.awardLevel },
      `Saved ${person.staffName}.`
    );
    if (ok) {
      setDrafts(({ [person.staffName]: _saved, ...rest }) => rest);
    }
  }

  async function resetPassword(person: StaffMember) {
    if (!window.confirm(`Reset ${person.staffName}'s password? They'll choose a new one next time they log in.`)) {
      return;
    }
    await send(person.staffName, "PATCH", { name: person.staffName, resetPassword: true }, `${person.staffName} can now set a new password.`);
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await send(
      "new",
      "POST",
      { name: newName.trim(), employmentType: newDraft.employmentType, awardLevel: newDraft.awardLevel },
      `Added ${newName.trim()}. They set their password and availability on the staff page.`
    );
    if (ok) {
      setNewName("");
      setNewDraft({ employmentType: "casual", awardLevel: "" });
    }
  }

  return (
    <>
      <ul className={`mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4 ${mutedText}`}>
        {EMPLOYMENT_TYPES.map((type) => (
          <li key={type} className={`${card} px-3 py-2`}>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{EMPLOYMENT_LABELS[type]}</span> —{" "}
            {EMPLOYMENT_RULES[type]}
          </li>
        ))}
      </ul>

      <form onSubmit={addPerson} className={`mt-4 flex flex-wrap items-end gap-3 p-4 ${card}`}>
        <label className="min-w-40 flex-1">
          <span className={label}>Add staff member</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className={`mt-1 w-full ${input}`}
          />
        </label>
        <TypeSelect value={newDraft.employmentType} onChange={(v) => setNewDraft({ ...newDraft, employmentType: v })} />
        <LevelSelect value={newDraft.awardLevel} rates={rates} onChange={(v) => setNewDraft({ ...newDraft, awardLevel: v })} />
        <button type="submit" disabled={saving !== null || !newName.trim()} className={primaryButton}>
          {saving === "new" ? "Adding…" : "Add"}
        </button>
      </form>

      {message && <p className={`mt-3 text-sm ${messageClass(message.type)}`}>{message.text}</p>}

      {staff.length === 0 ? (
        <p className={`mt-4 text-sm ${mutedText}`}>
          No staff yet. Add people above, or they appear here when they first submit availability.
        </p>
      ) : (
        <div className={`mt-4 overflow-x-auto ${card}`}>
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className={`border-b border-zinc-200 text-left dark:border-zinc-800 ${mutedText}`}>
                <th className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium dark:bg-zinc-950">Name</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Award level</th>
                {DAYS.map((day) => (
                  <th key={day} className="px-1.5 py-2.5 font-medium">
                    {day.slice(0, 3)}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-medium">Password</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {staff.map((person) => {
                const draft = drafts[person.staffName] ?? toDraft(person);
                const dirty = drafts[person.staffName] !== undefined;
                const setDraft = (change: Partial<Draft>) =>
                  setDrafts((all) => ({ ...all, [person.staffName]: { ...draft, ...change } }));
                return (
                  <tr key={person.staffName} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium whitespace-nowrap text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {person.staffName}
                      <div className={`text-xs font-normal ${mutedText}`}>
                        {person.updatedAt ? `Updated ${person.updatedAt.slice(0, 10)}` : "No availability yet"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <TypeSelect value={draft.employmentType} onChange={(v) => setDraft({ employmentType: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <LevelSelect value={draft.awardLevel} rates={rates} onChange={(v) => setDraft({ awardLevel: v })} />
                    </td>
                    {DAYS.map((day) => {
                      const chip = dayChip(person.week[day]);
                      return (
                        <td key={day} className="px-1.5 py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${chip.tone}`}>
                            {chip.text}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {person.hasPassword ? (
                        <button type="button" onClick={() => resetPassword(person)} disabled={saving !== null} className={linkButton}>
                          Reset
                        </button>
                      ) : (
                        <span className={`text-xs ${mutedText}`}>Not set yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {dirty && (
                        <>
                          <button
                            type="button"
                            onClick={() => saveRow(person)}
                            disabled={saving !== null}
                            className={`${primaryButton} py-1.5`}
                          >
                            {saving === person.staffName ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrafts(({ [person.staffName]: _undo, ...rest }) => rest)}
                            className={`ml-2 ${secondaryButton} py-1.5`}
                          >
                            Undo
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {refreshing && <p className={`px-4 py-2 text-xs ${mutedText}`}>Updating…</p>}
        </div>
      )}
      <p className={`mt-2 text-xs ${mutedText}`}>
        Award levels set the Fair Work minimum pay on the Wages tab (full-time/part-time rate shown; casuals and
        students get 25% more). To remove someone, delete their row in the Google Sheet.
      </p>
    </>
  );
}
