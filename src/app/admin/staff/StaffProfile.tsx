"use client";

import { useEffect, useState } from "react";
import { AWARD_LEVELS, AWARD_LEVEL_EXAMPLES, AWARD_LEVEL_NAMES, type AwardLevel } from "@/lib/award";
import { DAYS } from "@/lib/availability";
import { formatWeekdayDate } from "@/lib/dates";
import { EMPLOYMENT_LABELS, EMPLOYMENT_RULES, EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/employment";
import {
  RESTRICTION_LABELS,
  RESTRICTION_TYPES,
  type Restriction,
  type RestrictionType,
  SHIFT_PREFERENCES,
  SHIFT_PREFERENCE_LABELS,
  type ShiftPreference,
  describeRestriction,
} from "@/lib/profile";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, type SkillDef, type SkillLevel, type StaffSkills } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import {
  chip,
  errorBox,
  input,
  label,
  linkButton,
  mutedText,
  primaryButton,
  secondaryButton,
  sectionTitle,
  tones,
  warningBox,
} from "../../ui";
import { send } from "../api";
import Modal from "../Modal";

const CHECKER_KEY = "roster-checked-by";

interface Draft {
  employeeId: string;
  active: boolean;
  employmentType: EmploymentType;
  awardLevel: AwardLevel | "";
  skills: StaffSkills;
  restrictions: Restriction[];
  preferences: ShiftPreference[];
}

function dayText(person: StaffMember, day: (typeof DAYS)[number]) {
  const d = person.week[day];
  return d.status === "available_all_day" ? "All day" : d.status === "custom" ? `${d.startTime}–${d.endTime}` : "Off";
}

export default function StaffProfile({
  person,
  skills,
  rates,
  today,
  onSaved,
  onClose,
}: {
  person: StaffMember;
  skills: SkillDef[];
  rates: Record<AwardLevel, number>;
  today: string;
  onSaved: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    employeeId: person.employeeId,
    active: person.active,
    employmentType: person.employmentType,
    awardLevel: person.awardLevel ?? "",
    skills: person.skills,
    restrictions: person.restrictions,
    preferences: person.preferences,
  }));
  const [checkedBy, setCheckedBy] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [newRestriction, setNewRestriction] = useState<Restriction>({ type: "no_heavy", note: "", until: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckedBy(localStorage.getItem(CHECKER_KEY) ?? "");
    } catch {
      // storage blocked — type it each time
    }
  }, []);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const unreadable = (cell: string) => person.unreadable.includes(cell);

  function setSkill(id: string, level: SkillLevel | "", kind: SkillDef["kind"]) {
    const next = { ...draft.skills };
    if (!level) delete next[id];
    else {
      const old = next[id];
      next[id] = {
        level: kind === "qualification" ? "qualified" : level,
        verifiedOn: old && old.level === level ? old.verifiedOn : today,
        verifiedBy: old && old.level === level ? old.verifiedBy : checkedBy.trim(),
        expiresOn: old?.expiresOn ?? "",
      };
    }
    update("skills", next);
  }

  function setSkillField(id: string, field: "verifiedOn" | "verifiedBy" | "expiresOn", value: string) {
    update("skills", { ...draft.skills, [id]: { ...draft.skills[id], [field]: value } });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      localStorage.setItem(CHECKER_KEY, checkedBy.trim());
    } catch {
      // not remembered — fine
    }
    const result = await send("/api/admin/staff", "PATCH", {
      name: person.staffName,
      employeeId: draft.employeeId,
      active: draft.active,
      employmentType: draft.employmentType,
      awardLevel: draft.awardLevel,
      preferences: draft.preferences,
      ...(unreadable("Skills") ? {} : { skills: draft.skills }),
      ...(unreadable("Restrictions") ? {} : { restrictions: draft.restrictions }),
    });
    setSaving(false);
    if (!result.ok) setError(result.error);
    else onSaved(`Saved ${person.staffName}'s profile.`);
  }

  async function resetPassword() {
    if (!window.confirm(`Reset ${person.staffName}'s password? They'll choose a new one next time they log in.`)) return;
    const result = await send("/api/admin/staff", "PATCH", { name: person.staffName, resetPassword: true });
    if (!result.ok) setError(result.error);
    else onSaved(`${person.staffName} can now set a new password.`);
  }

  async function decide(id: string, status: "approved" | "declined" | "resolved") {
    const result = await send("/api/admin/staff", "PATCH", { name: person.staffName, requestDecision: { id, status } });
    if (!result.ok) setError(result.error);
    else onSaved("Request answered.");
  }

  const active = skills.filter((s) => s.active || draft.skills[s.id]);
  const visible = showAll ? active : active.filter((s) => draft.skills[s.id]);
  const recorded = Object.keys(draft.skills).length;
  const openRequests = person.requests.filter((r) => r.status === "pending");
  const pastRequests = person.requests.filter((r) => r.status !== "pending").slice(-5).reverse();

  return (
    <Modal
      title={
        <span className="flex flex-wrap items-center gap-2">
          {person.staffName}
          {!draft.active && <span className={`${chip} ${tones.neutral}`}>Inactive</span>}
        </span>
      }
      subtitle={person.updatedAt ? `Availability updated ${person.updatedAt.slice(0, 10)}` : "Hasn't entered availability yet"}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={saving} className={primaryButton}>
            {saving ? "Saving…" : "Save profile"}
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      }
    >
      {person.unreadable.length > 0 && (
        <div className={`mb-4 ${errorBox}`}>
          The {person.unreadable.join(" and ")} cell{person.unreadable.length === 1 ? "" : "s"} for {person.staffName} in
          the Google Sheet can&apos;t be read. {person.unreadable.length === 1 ? "It is" : "They are"} kept exactly as{" "}
          {person.unreadable.length === 1 ? "it is" : "they are"} and can&apos;t be changed here until fixed or cleared in the sheet.
        </div>
      )}

      <section>
        <h3 className={sectionTitle}>Employment</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className={label}>Employee ID</span>
            <input value={draft.employeeId} onChange={(e) => update("employeeId", e.target.value)} maxLength={40} className={`mt-1 w-full ${input}`} />
          </label>
          <label>
            <span className={label}>Type</span>
            <select value={draft.employmentType} onChange={(e) => update("employmentType", e.target.value as EmploymentType)} className={`mt-1 w-full ${input}`}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_LABELS[t]}
                </option>
              ))}
            </select>
            <span className={`mt-0.5 block text-xs ${mutedText}`}>{EMPLOYMENT_RULES[draft.employmentType]}</span>
          </label>
          <label>
            <span className={label}>Award level</span>
            <select
              value={draft.awardLevel}
              onChange={(e) => update("awardLevel", e.target.value as AwardLevel | "")}
              className={`mt-1 w-full ${input}`}
            >
              <option value="">Not set</option>
              {AWARD_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {AWARD_LEVEL_NAMES[l]} · ${rates[l].toFixed(2)}
                </option>
              ))}
            </select>
            {draft.awardLevel && <span className={`mt-0.5 block text-xs ${mutedText}`}>{AWARD_LEVEL_EXAMPLES[draft.awardLevel]}</span>}
          </label>
          <label className="flex items-center gap-2 self-center text-sm">
            <input type="checkbox" className="h-4 w-4" checked={draft.active} onChange={(e) => update("active", e.target.checked)} />
            Active (inactive staff are never rostered; their history stays)
          </label>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className={sectionTitle}>Skills and qualifications</h3>
            <p className={`text-xs ${mutedText}`}>
              Recorded once, used for every event. Nothing recorded means “not verified” — never assumed. Past its
              expiry or review date, a record doesn&apos;t count until it&apos;s re-checked.
            </p>
          </div>
          <label className="w-48">
            <span className={label}>Checked by</span>
            <input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="Your name" className={`mt-1 w-full ${input}`} />
          </label>
        </div>
        {visible.length === 0 ? (
          <p className={`mt-2 text-sm ${mutedText}`}>Nothing recorded yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className={`text-left text-xs ${mutedText}`}>
                  <th className="py-1 pr-2 font-medium">Skill / qualification</th>
                  <th className="py-1 pr-2 font-medium">Level</th>
                  <th className="py-1 pr-2 font-medium">Checked on</th>
                  <th className="py-1 pr-2 font-medium">By</th>
                  <th className="py-1 font-medium">Expires / review</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const record = draft.skills[s.id];
                  const expired = record?.expiresOn && record.expiresOn < today;
                  return (
                    <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="py-1.5 pr-2">
                        {s.name}
                        {s.kind === "qualification" && <span className={`ml-1 text-xs ${mutedText}`}>(qualification)</span>}
                        {expired && <span className={`ml-1 ${chip} ${tones.bad}`}>Expired</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        {s.kind === "qualification" ? (
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              disabled={unreadable("Skills")}
                              checked={Boolean(record)}
                              onChange={(e) => setSkill(s.id, e.target.checked ? "qualified" : "", s.kind)}
                            />
                            Held
                          </label>
                        ) : (
                          <select
                            value={record?.level ?? ""}
                            disabled={unreadable("Skills")}
                            onChange={(e) => setSkill(s.id, e.target.value as SkillLevel | "", s.kind)}
                            className={`${input} py-1`}
                            aria-label={`${s.name} level`}
                          >
                            <option value="">Not verified</option>
                            {SKILL_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {SKILL_LEVEL_LABELS[l]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        {record && (
                          <input type="date" value={record.verifiedOn} onChange={(e) => setSkillField(s.id, "verifiedOn", e.target.value)} className={`${input} py-1`} aria-label={`${s.name} checked on`} />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        {record && (
                          <input value={record.verifiedBy} onChange={(e) => setSkillField(s.id, "verifiedBy", e.target.value)} className={`${input} w-28 py-1`} aria-label={`${s.name} checked by`} />
                        )}
                      </td>
                      <td className="py-1.5">
                        {record && (
                          <input type="date" value={record.expiresOn} onChange={(e) => setSkillField(s.id, "expiresOn", e.target.value)} className={`${input} py-1`} aria-label={`${s.name} expires`} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" onClick={() => setShowAll(!showAll)} className={`${linkButton} mt-2`}>
          {showAll ? `Show only recorded (${recorded})` : `Record a skill or qualification (${active.length} available)`}
        </button>
      </section>

      <section className="mt-6">
        <h3 className={sectionTitle}>
          Work restrictions <span className={`font-normal ${mutedText}`}>· admins only</span>
        </h3>
        <p className={`text-xs ${mutedText}`}>
          Only what rostering needs (e.g. “no heavy lifting until 1 Dec”) — no medical details.
        </p>
        {draft.restrictions.length > 0 && (
          <ul className="mt-2 space-y-1">
            {draft.restrictions.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className={`${chip} ${r.until && r.until < today ? tones.neutral : tones.warn}`}>
                  {r.until && r.until < today ? "Ended" : "Active"}
                </span>
                <span className="min-w-0 flex-1">{describeRestriction(r)}</span>
                <button
                  type="button"
                  disabled={unreadable("Restrictions")}
                  onClick={() => update("restrictions", draft.restrictions.filter((_, j) => j !== i))}
                  className="px-1 text-zinc-400 hover:text-red-600"
                  aria-label="Remove restriction"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select
            value={newRestriction.type}
            onChange={(e) => setNewRestriction({ ...newRestriction, type: e.target.value as RestrictionType })}
            className={input}
            aria-label="Restriction"
          >
            {RESTRICTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESTRICTION_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            value={newRestriction.note}
            onChange={(e) => setNewRestriction({ ...newRestriction, note: e.target.value })}
            placeholder={newRestriction.type === "note" ? "What to check (required)" : "Detail (optional)"}
            className={`min-w-40 flex-1 ${input}`}
            aria-label="Detail"
          />
          <label className="text-xs">
            <span className={label}>Until (optional)</span>
            <input type="date" value={newRestriction.until} onChange={(e) => setNewRestriction({ ...newRestriction, until: e.target.value })} className={`mt-1 ${input}`} />
          </label>
          <button
            type="button"
            disabled={unreadable("Restrictions") || (newRestriction.type === "note" && !newRestriction.note.trim())}
            onClick={() => {
              update("restrictions", [...draft.restrictions, { ...newRestriction, note: newRestriction.note.trim() }]);
              setNewRestriction({ type: "no_heavy", note: "", until: "" });
            }}
            className={secondaryButton}
          >
            Add
          </button>
        </div>
      </section>

      <section className="mt-6">
        <h3 className={sectionTitle}>Preferred shifts</h3>
        <p className={`text-xs ${mutedText}`}>Used to rank people who can all work a shift; never overrides the rules.</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SHIFT_PREFERENCES.map((p) => (
            <label key={p} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft.preferences.includes(p)}
                onChange={(e) =>
                  update("preferences", e.target.checked ? [...draft.preferences, p] : draft.preferences.filter((x) => x !== p))
                }
              />
              {SHIFT_PREFERENCE_LABELS[p]}
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h3 className={sectionTitle}>Weekly availability</h3>
        <p className={`text-xs ${mutedText}`}>Set by {person.staffName} on the staff page.</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {DAYS.map((d) => (
            <li key={d} className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-900">
              <span className={`block text-xs ${mutedText}`}>{d.slice(0, 3)}</span>
              <span className="tabular-nums">{dayText(person, d)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h3 className={sectionTitle}>Requests</h3>
        {openRequests.length === 0 && pastRequests.length === 0 && <p className={`text-sm ${mutedText}`}>None.</p>}
        {openRequests.map((r) => (
          <div key={r.id} className={`mt-2 ${warningBox}`}>
            <p className="font-medium">
              {r.kind === "time_off"
                ? `Time off ${formatWeekdayDate(r.from)}${r.to !== r.from ? ` – ${formatWeekdayDate(r.to)}` : ""}`
                : `Change to ${r.eventName} on ${formatWeekdayDate(r.from)}`}
            </p>
            {r.note && <p>“{r.note}”</p>}
            <div className="mt-1 flex gap-2">
              {r.kind === "time_off" ? (
                <>
                  <button type="button" onClick={() => decide(r.id, "approved")} className={`${secondaryButton} py-1`}>
                    Approve
                  </button>
                  <button type="button" onClick={() => decide(r.id, "declined")} className={`${secondaryButton} py-1`}>
                    Decline
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => decide(r.id, "resolved")} className={`${secondaryButton} py-1`}>
                  Mark as sorted
                </button>
              )}
            </div>
          </div>
        ))}
        {pastRequests.length > 0 && (
          <ul className={`mt-2 space-y-0.5 text-xs ${mutedText}`}>
            {pastRequests.map((r) => (
              <li key={r.id}>
                {r.kind === "time_off" ? `Time off ${r.from}${r.to !== r.from ? ` to ${r.to}` : ""}` : `Change: ${r.eventName} ${r.from}`} —{" "}
                {r.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-900">
        <span className={mutedText}>
          Password:{" "}
          {person.hasPassword ? (person.passwordIsPlainText ? "set (old plain-text format)" : "set") : "not set yet — they choose one when they first log in"}
        </span>
        {person.hasPassword && (
          <button type="button" onClick={resetPassword} className={linkButton}>
            Reset password
          </button>
        )}
      </section>
    </Modal>
  );
}
