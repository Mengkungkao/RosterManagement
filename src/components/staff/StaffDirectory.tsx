"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AWARD_LEVELS, AWARD_LEVEL_NAMES, type AwardLevel } from "@/lib/award";
import { DAYS, type DayAvailability } from "@/lib/availability";
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/employment";
import { levelRank, type SkillDef } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import {
  card,
  chip,
  input,
  label,
  linkButton,
  messageClass,
  mutedText,
  primaryButton,
  secondaryButton,
  tones,
  warningBox,
} from "../../ui";
import { send } from "../api";
import StaffProfile from "./StaffProfile";

type Message = { type: "success" | "error"; text: string } | null;

function dayChip(day: DayAvailability) {
  if (day.status === "available_all_day") return { text: "All day", tone: tones.good };
  if (day.status === "custom") return { text: `${day.startTime}–${day.endTime}`, tone: tones.info };
  return { text: "Off", tone: tones.neutral };
}

function topSkills(person: StaffMember, skills: SkillDef[], today: string): string[] {
  return Object.entries(person.skills)
    .filter(([, r]) => !r.expiresOn || r.expiresOn >= today)
    .sort((a, b) => levelRank(b[1].level) - levelRank(a[1].level))
    .map(([id]) => skills.find((s) => s.id === id)?.name.replace(/ \(.*\)$/, "") ?? id);
}

function setPersonParam(name: string | null) {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set("person", name);
  else url.searchParams.delete("person");
  window.history.replaceState(null, "", url);
}

export default function StaffManager({
  staff,
  skills,
  rates,
  today,
  initialPerson,
}: {
  staff: StaffMember[];
  skills: SkillDef[];
  rates: Record<AwardLevel, number>;
  today: string;
  initialPerson: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [openName, setOpenName] = useState<string | null>(initialPerson);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EmploymentType>("casual");
  const [newLevel, setNewLevel] = useState<AwardLevel | "">("");

  const inactive = staff.filter((s) => !s.active).length;
  const plainText = staff.filter((s) => s.passwordIsPlainText).length;
  const shown = staff.filter(
    (s) =>
      (showInactive || s.active) &&
      (!search.trim() ||
        s.staffName.toLowerCase().includes(search.trim().toLowerCase()) ||
        s.employeeId.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const open = staff.find((s) => s.staffName.toLowerCase() === openName?.toLowerCase()) ?? null;

  const refresh = () => startRefresh(() => router.refresh());
  const choose = (name: string | null) => {
    setOpenName(name);
    setPersonParam(name);
  };

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving("new");
    setMessage(null);
    const result = await send("/api/admin/staff", "POST", { name: newName.trim(), employmentType: newType, awardLevel: newLevel });
    setSaving(null);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "success", text: `Added ${newName.trim()}. Open their profile to record skills; they set their own password and availability.` });
    setNewName("");
    setNewLevel("");
    setNewType("casual");
    refresh();
  }

  async function securePasswords() {
    setSaving("secure");
    const result = await send<{ secured: number }>("/api/admin/staff/secure-passwords", "POST");
    setSaving(null);
    setMessage(
      result.ok
        ? { type: "success", text: `Secured ${result.data.secured} password${result.data.secured === 1 ? "" : "s"}. They still work as before.` }
        : { type: "error", text: result.error }
    );
    if (result.ok) refresh();
  }

  return (
    <>
      {plainText > 0 && (
        <div className={`mt-4 flex flex-wrap items-center gap-3 ${warningBox}`}>
          <span className="flex-1">
            {plainText} staff password{plainText === 1 ? " is" : "s are"} still stored as plain text in the sheet (from the
            previous version). Securing replaces {plainText === 1 ? "it" : "them"} with a one-way hash; nobody&apos;s
            password changes.
          </span>
          <button type="button" onClick={securePasswords} disabled={saving !== null} className={secondaryButton}>
            {saving === "secure" ? "Securing…" : "Secure them now"}
          </button>
        </div>
      )}

      <form onSubmit={addPerson} className={`mt-4 flex flex-wrap items-end gap-3 p-4 ${card}`}>
        <label className="min-w-40 flex-1">
          <span className={label}>Add staff member</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className={`mt-1 w-full ${input}`} />
        </label>
        <label>
          <span className={label}>Type</span>
          <select value={newType} onChange={(e) => setNewType(e.target.value as EmploymentType)} className={`mt-1 ${input}`}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Award level</span>
          <select value={newLevel} onChange={(e) => setNewLevel(e.target.value as AwardLevel | "")} className={`mt-1 ${input}`}>
            <option value="">Not set</option>
            {AWARD_LEVELS.map((l) => (
              <option key={l} value={l}>
                {AWARD_LEVEL_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving !== null || !newName.trim()} className={primaryButton}>
          {saving === "new" ? "Adding…" : "Add"}
        </button>
      </form>

      {message && <p className={`mt-3 text-sm ${messageClass(message.type)}`} role="status">{message.text}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find by name or ID"
          aria-label="Find staff"
          className={`min-w-48 flex-1 sm:max-w-xs ${input}`}
        />
        {inactive > 0 && (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive ({inactive})
          </label>
        )}
        {refreshing && <span className={`text-sm ${mutedText}`}>Updating…</span>}
      </div>

      {staff.length === 0 ? (
        <p className={`mt-4 text-sm ${mutedText}`}>No staff yet. Add people above, or they appear here when they first submit availability.</p>
      ) : (
        <div className={`mt-3 overflow-x-auto ${card}`}>
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className={`border-b border-zinc-200 text-left dark:border-zinc-800 ${mutedText}`}>
                <th className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium dark:bg-zinc-950">Name</th>
                <th className="px-3 py-2.5 font-medium">Type · level</th>
                <th className="px-3 py-2.5 font-medium">Skills</th>
                {DAYS.map((day) => (
                  <th key={day} className="px-1 py-2.5 font-medium">
                    {day.slice(0, 3)}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => {
                const top = topSkills(person, skills, today);
                const pending = person.requests.filter((r) => r.status === "pending").length;
                const restricted = person.restrictions.some((r) => !r.until || r.until >= today);
                return (
                  <tr key={person.staffName} className={`border-b border-zinc-100 last:border-0 dark:border-zinc-900 ${person.active ? "" : "opacity-60"}`}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap dark:bg-zinc-950">
                      <button type="button" onClick={() => choose(person.staffName)} className="text-left font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                        {person.staffName}
                      </button>
                      <div className={`text-xs ${mutedText}`}>
                        {person.employeeId ? `ID ${person.employeeId}` : person.updatedAt ? `Updated ${person.updatedAt.slice(0, 10)}` : "No availability yet"}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {EMPLOYMENT_LABELS[person.employmentType]}
                      <div className={`text-xs ${person.awardLevel ? mutedText : "text-amber-700 dark:text-amber-400"}`}>
                        {person.awardLevel ? AWARD_LEVEL_NAMES[person.awardLevel] : "No award level"}
                      </div>
                    </td>
                    <td className="max-w-56 px-3 py-2">
                      {top.length === 0 ? (
                        <span className={`text-xs ${mutedText}`}>None recorded</span>
                      ) : (
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">
                          {top.slice(0, 3).join(", ")}
                          {top.length > 3 && <span className={mutedText}> +{top.length - 3}</span>}
                        </span>
                      )}
                    </td>
                    {DAYS.map((day) => {
                      const c = dayChip(person.week[day]);
                      return (
                        <td key={day} className="px-1 py-2">
                          <span className={`${chip} ${c.tone}`}>{c.text}</span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {!person.active && <span className={`${chip} ${tones.neutral}`}>Inactive</span>}
                        {restricted && <span className={`${chip} ${tones.warn}`}>Restriction</span>}
                        {pending > 0 && <span className={`${chip} ${tones.info}`}>{pending} request{pending === 1 ? "" : "s"}</span>}
                        {person.unreadable.length > 0 && <span className={`${chip} ${tones.bad}`}>Check sheet</span>}
                        <button type="button" onClick={() => choose(person.staffName)} className={`${linkButton} text-xs`}>
                          Profile
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className={`p-4 text-sm ${mutedText}`}>No one matches.</p>}
        </div>
      )}
      <p className={`mt-2 text-xs ${mutedText}`}>
        Kept in the sheet&apos;s order. To remove someone for good, mark them inactive (their history and pay records
        stay), or delete their row in the Google Sheet.
      </p>

      {open && (
        <StaffProfile
          key={open.staffName}
          person={open}
          skills={skills}
          rates={rates}
          today={today}
          onClose={() => choose(null)}
          onSaved={(text) => {
            choose(null);
            setMessage({ type: "success", text });
            refresh();
          }}
        />
      )}
    </>
  );
}
