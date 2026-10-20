"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AWARD_LEVELS, AWARD_LEVEL_EXAMPLES, AWARD_LEVEL_NAMES, type AwardLevel } from "@/lib/award";
import { DAYS, availabilityGiven } from "@/lib/availability";
import { addDays, formatHours, formatWeekdayDate } from "@/lib/dates";
import { EMPLOYMENT_LABELS, EMPLOYMENT_RULES, EMPLOYMENT_TYPES, type EmploymentType, STUDENT_MAX_FORTNIGHT_HOURS, softFortnightLimit } from "@/lib/employment";
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
import type { HoursSummary } from "@/lib/roster";
import { RECORD_LEVELS, RECORD_LEVEL_LABELS, type RecordLevel, type SkillDef, type StaffSkills } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import { send } from "../admin/api";
import { describeRequest } from "../dashboard/RequestsPanel";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Drawer } from "../ui/Overlay";
import { cn } from "../ui/cn";
import { useConfirm, useToast } from "../ui/feedback";

const CHECKER_KEY = "roster-checked-by";

export interface UpcomingShift {
  date: string;
  time: string;
  eventName: string;
  taskName: string;
  href: string;
  draft: boolean;
}

interface Draft {
  employeeId: string;
  active: boolean;
  employmentType: EmploymentType;
  awardLevel: AwardLevel | "";
  skills: StaffSkills;
  restrictions: Restriction[];
  preferences: ShiftPreference[];
  notes: string;
}

const SECTIONS = [
  ["details", "Details"],
  ["skills", "Skills"],
  ["qualifications", "Qualifications"],
  ["availability", "Availability"],
  ["shifts", "Shifts"],
  ["notes", "Notes"],
] as const;

function Section({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={`profile-${id}`} className="scroll-mt-2 border-b border-line py-5 first:pt-1 last:border-0">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A compact caption above a control in a dense row (the control keeps its own aria-label).
function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span aria-hidden="true" className="mb-0.5 block text-[11px] text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function SkillLevelBadge({ level }: { level: RecordLevel | null }) {
  if (!level) return <Badge icon="circleDashed">Not verified</Badge>;
  if (level === "not_yet") return <Badge tone="danger" icon="x">Not yet competent</Badge>;
  return (
    <Badge tone={level === "learning" ? "neutral" : "info"} icon="check">
      {RECORD_LEVEL_LABELS[level]}
    </Badge>
  );
}

// One person's profile in sections: employment, skills, qualifications and
// safety, availability and requests, shifts and hours, manager notes.
export default function StaffProfile({
  person,
  skills,
  rates,
  today,
  hours,
  shifts,
  onSaved,
  onClose,
}: {
  person: StaffMember;
  skills: SkillDef[];
  rates: Record<AwardLevel, number>;
  today: string;
  hours: HoursSummary | undefined;
  shifts: UpcomingShift[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const initial: Draft = {
    employeeId: person.employeeId,
    active: person.active,
    employmentType: person.employmentType,
    awardLevel: person.awardLevel ?? "",
    skills: person.skills,
    restrictions: person.restrictions,
    preferences: person.preferences,
    notes: person.notes,
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [checkedBy, setCheckedBy] = useState("");
  const [addSkill, setAddSkill] = useState("");
  const [newRestriction, setNewRestriction] = useState<Restriction>({ type: "no_heavy", note: "", until: "" });
  const [saving, setSaving] = useState(false);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

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
  const skillDefs = skills.filter((s) => s.kind === "skill" && (s.active || draft.skills[s.id]));
  const qualDefs = skills.filter((s) => s.kind === "qualification" && (s.active || draft.skills[s.id]));
  const recordedSkills = skillDefs.filter((s) => draft.skills[s.id]);
  const unrecorded = skillDefs.filter((s) => !draft.skills[s.id]);
  const limit = person.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(person.employmentType);

  function setRecord(id: string, level: RecordLevel | "") {
    const next = { ...draft.skills };
    if (!level) delete next[id];
    else {
      const old = next[id];
      next[id] = {
        level,
        verifiedOn: old && old.level === level ? old.verifiedOn : today,
        verifiedBy: old && old.level === level ? old.verifiedBy : checkedBy.trim(),
        expiresOn: old?.expiresOn ?? "",
      };
    }
    update("skills", next);
  }

  function setField(id: string, field: "verifiedOn" | "verifiedBy" | "expiresOn", value: string) {
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
      notes: draft.notes,
      ...(unreadable("Skills") ? {} : { skills: draft.skills }),
      ...(unreadable("Restrictions") ? {} : { restrictions: draft.restrictions }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Saved ${person.staffName}'s profile.`);
    onSaved();
    onClose();
  }

  async function resetPassword() {
    const ok = await confirm({
      title: `Reset ${person.staffName}'s password?`,
      description: "Their current password stops working. They choose a new one the next time they open the staff page.",
      confirmLabel: "Reset password",
      tone: "danger",
    });
    if (!ok) return;
    const result = await send("/api/admin/staff", "PATCH", { name: person.staffName, resetPassword: true });
    if (!result.ok) setError(result.error);
    else {
      toast.success(`${person.staffName} can now choose a new password.`);
      onSaved();
    }
  }

  async function decide(id: string, status: "approved" | "declined" | "resolved") {
    setBusyRequest(id);
    const result = await send("/api/admin/staff", "PATCH", { name: person.staffName, requestDecision: { id, status } });
    setBusyRequest(null);
    if (!result.ok) setError(result.error);
    else {
      toast.success(status === "approved" ? "Time off approved." : status === "declined" ? "Time off declined." : "Request marked as sorted.");
      onSaved();
    }
  }

  const openRequests = person.requests.filter((r) => r.status === "pending");
  const pastRequests = person.requests.filter((r) => r.status !== "pending").slice(-5).reverse();
  const qualStatus = (id: string) => {
    const r = draft.skills[id];
    if (!r) return { text: "Not held", tone: "neutral" as const };
    if (r.expiresOn && r.expiresOn < today) return { text: `Expired ${r.expiresOn}`, tone: "danger" as const };
    if (r.expiresOn && r.expiresOn <= addDays(today, 30)) return { text: `Expires ${r.expiresOn}`, tone: "warning" as const };
    return { text: r.expiresOn ? `Current to ${r.expiresOn}` : "Held", tone: "success" as const };
  };

  return (
    <Drawer
      width="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {person.staffName}
          {!draft.active && <Badge>Inactive</Badge>}
        </span>
      }
      subtitle={
        <>
          {EMPLOYMENT_LABELS[person.employmentType]}
          {person.employeeId && ` · ID ${person.employeeId}`} ·{" "}
          {person.updatedAt ? `availability updated ${person.updatedAt.slice(0, 10)}` : "hasn't entered availability yet"}
        </>
      }
      onClose={onClose}
      nav={
        <nav aria-label="Profile sections" className="flex gap-1 overflow-x-auto border-b border-line px-4 py-1.5">
          {SECTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => document.getElementById(`profile-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" })}
              className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap text-muted hover:bg-surface-3 hover:text-fg"
            >
              {label}
            </button>
          ))}
        </nav>
      }
      footer={
        <>
          <Button variant="primary" icon="check" loading={saving} disabled={!dirty} onClick={save}>
            Save profile
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {dirty ? "Discard changes" : "Close"}
          </Button>
          {dirty && <span className="ml-auto text-xs text-muted">Unsaved changes</span>}
        </>
      }
    >
      <div ref={body}>
        {error && (
          <Alert tone="danger" className="mb-3" role="alert">
            {error}
          </Alert>
        )}
        {person.unreadable.length > 0 && (
          <Alert tone="danger" className="mb-3" title="Part of this row in the Google Sheet can't be read">
            The {person.unreadable.join(" and ")} cell{person.unreadable.length === 1 ? " is" : "s are"} kept exactly as{" "}
            {person.unreadable.length === 1 ? "it is" : "they are"} and can&apos;t be changed here until fixed or cleared in the sheet.
          </Alert>
        )}

        <Section id="details" title="Employment details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID" optional>
              <Input value={draft.employeeId} onChange={(e) => update("employeeId", e.target.value)} maxLength={40} />
            </Field>
            <Field label="Employment type" hint={EMPLOYMENT_RULES[draft.employmentType]}>
              <Select value={draft.employmentType} onChange={(e) => update("employmentType", e.target.value as EmploymentType)}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Award level" hint={draft.awardLevel ? AWARD_LEVEL_EXAMPLES[draft.awardLevel] : "Needed for their wage estimate"}>
              <Select value={draft.awardLevel} onChange={(e) => update("awardLevel", e.target.value as AwardLevel | "")}>
                <option value="">Not set</option>
                {AWARD_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {AWARD_LEVEL_NAMES[l]} · ${rates[l].toFixed(2)}/h
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Checkbox
                label="Active"
                description="Inactive staff are never rostered; their history and pay stay."
                checked={draft.active}
                onChange={(e) => update("active", e.target.checked)}
              />
            </div>
          </div>
        </Section>

        <Section
          id="skills"
          title="Skills and capabilities"
          description={
            <>
              Recorded once and used for every event. <strong className="font-medium">Not verified</strong> means nobody has checked —
              never assumed competent. <strong className="font-medium">Not yet competent</strong> means it was checked and they
              aren&apos;t ready yet. Past its review date, a record doesn&apos;t count until it&apos;s re-checked.
            </>
          }
        >
          <Field label="Checked by" hint="Your name, saved with each record you add or change." className="mb-3 max-w-60">
            <Input value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} placeholder="Your name" />
          </Field>
          {recordedSkills.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-sm text-muted">No skills recorded — everything is “not verified”.</p>
          ) : (
            <ul className="space-y-2">
              {recordedSkills.map((s) => {
                const r = draft.skills[s.id];
                const overdue = r.expiresOn && r.expiresOn < today;
                return (
                  <li key={s.id} className={cn("rounded-lg border px-3 py-2.5", overdue ? "border-danger-line" : "border-line")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium text-fg">{s.name}</span>
                      {overdue ? <Badge tone="danger" icon="alert">Check overdue</Badge> : <SkillLevelBadge level={r.level} />}
                      <IconButton icon="trash" size="sm" label={`Remove ${s.name} (back to not verified)`} disabled={unreadable("Skills")} onClick={() => setRecord(s.id, "")} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Small label="Level">
                        <Select value={r.level} disabled={unreadable("Skills")} onChange={(e) => setRecord(s.id, e.target.value as RecordLevel)} aria-label={`${s.name} level`}>
                          {RECORD_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {RECORD_LEVEL_LABELS[l]}
                            </option>
                          ))}
                        </Select>
                      </Small>
                      <Small label="Checked on">
                        <Input type="date" value={r.verifiedOn} onChange={(e) => setField(s.id, "verifiedOn", e.target.value)} aria-label={`${s.name} checked on`} />
                      </Small>
                      <Small label="Checked by">
                        <Input value={r.verifiedBy} onChange={(e) => setField(s.id, "verifiedBy", e.target.value)} aria-label={`${s.name} checked by`} />
                      </Small>
                      <Small label="Review by (optional)">
                        <Input type="date" value={r.expiresOn} onChange={(e) => setField(s.id, "expiresOn", e.target.value)} aria-label={`${s.name} review date`} />
                      </Small>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {unrecorded.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select value={addSkill} onChange={(e) => setAddSkill(e.target.value)} aria-label="Skill to record" className="w-full sm:w-64" disabled={unreadable("Skills")}>
                <option value="">Record a skill…</option>
                {unrecorded.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                icon="plus"
                disabled={!addSkill || unreadable("Skills")}
                onClick={() => {
                  setRecord(addSkill, "trained");
                  setAddSkill("");
                }}
              >
                Add as Trained
              </Button>
              <span className="text-xs text-muted">then set the level</span>
            </div>
          )}
        </Section>

        <Section id="qualifications" title="Qualifications and safety" description="Qualifications are held or not, with an expiry date. Expired ones don't count.">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {qualDefs.map((q) => {
              const r = draft.skills[q.id];
              const st = qualStatus(q.id);
              return (
                <li key={q.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Checkbox
                      className="min-w-0 flex-1"
                      label={<span className="font-medium text-fg">{q.name}</span>}
                      disabled={unreadable("Skills")}
                      checked={Boolean(r)}
                      onChange={(e) => setRecord(q.id, e.target.checked ? "qualified" : "")}
                    />
                    <Badge tone={st.tone}>{st.text}</Badge>
                  </div>
                  {r && (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-6 sm:grid-cols-3">
                      <Small label="Checked on">
                        <Input type="date" value={r.verifiedOn} onChange={(e) => setField(q.id, "verifiedOn", e.target.value)} aria-label={`${q.name} checked on`} />
                      </Small>
                      <Small label="Checked by">
                        <Input value={r.verifiedBy} onChange={(e) => setField(q.id, "verifiedBy", e.target.value)} aria-label={`${q.name} checked by`} />
                      </Small>
                      <Small label="Expires (optional)">
                        <Input type="date" value={r.expiresOn} onChange={(e) => setField(q.id, "expiresOn", e.target.value)} aria-label={`${q.name} expires`} />
                      </Small>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-5">
            <h4 className="flex items-center gap-1.5 text-[13px] font-medium text-fg-2">
              <Icon name="shield" size={14} />
              Work restrictions <span className="font-normal text-muted">· managers only</span>
            </h4>
            <p className="mt-0.5 text-xs text-muted">Only what rostering needs (e.g. “no heavy lifting until 1 Dec”) — no medical details.</p>
            {draft.restrictions.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {draft.restrictions.map((r, i) => {
                  const ended = r.until && r.until < today;
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm">
                      <Badge tone={ended ? "neutral" : "warning"}>{ended ? "Ended" : "Applies"}</Badge>
                      <span className="min-w-0 flex-1 text-fg-2">{describeRestriction(r)}</span>
                      <IconButton
                        icon="x"
                        size="sm"
                        label="Remove restriction"
                        disabled={unreadable("Restrictions")}
                        onClick={() => update("restrictions", draft.restrictions.filter((_, j) => j !== i))}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_9rem_auto]">
              <Select value={newRestriction.type} onChange={(e) => setNewRestriction({ ...newRestriction, type: e.target.value as RestrictionType })} aria-label="Restriction">
                {RESTRICTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RESTRICTION_LABELS[t]}
                  </option>
                ))}
              </Select>
              <Input
                value={newRestriction.note}
                onChange={(e) => setNewRestriction({ ...newRestriction, note: e.target.value })}
                placeholder={newRestriction.type === "note" ? "What to check (required)" : "Detail (optional)"}
                aria-label="Detail"
              />
              <Input type="date" value={newRestriction.until} onChange={(e) => setNewRestriction({ ...newRestriction, until: e.target.value })} aria-label="Applies until (optional)" title="Until (optional)" />
              <Button
                icon="plus"
                disabled={unreadable("Restrictions") || (newRestriction.type === "note" && !newRestriction.note.trim())}
                onClick={() => {
                  update("restrictions", [...draft.restrictions, { ...newRestriction, note: newRestriction.note.trim() }]);
                  setNewRestriction({ type: "no_heavy", note: "", until: "" });
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </Section>

        <Section id="availability" title="Availability and preferences" description={`Weekly availability is set by ${person.staffName} on the staff page.`}>
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {DAYS.map((d) => {
              const day = person.week[d];
              return (
                <li key={d} className={cn("rounded-md border px-2 py-1.5 text-center", day.status === "unavailable" ? "border-line bg-surface-2" : "border-success-line bg-success-soft")}>
                  <span className="block text-[11px] text-muted">{d.slice(0, 3)}</span>
                  <span className={cn("text-xs font-medium tabular-nums", day.status === "unavailable" ? "text-muted" : "text-success")}>
                    {day.status === "available_all_day" ? "All day" : day.status === "custom" ? `${day.startTime}–${day.endTime}` : "Off"}
                  </span>
                </li>
              );
            })}
          </ul>
          {!availabilityGiven(person.week, person.updatedAt) && <p className="mt-1.5 text-xs text-warning">Not set yet — shown as unavailable until they enter it.</p>}

          <h4 className="mt-4 text-[13px] font-medium text-fg-2">Preferred shifts</h4>
          <p className="text-xs text-muted">Ranks people who can all work a shift; never overrides the rules.</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {SHIFT_PREFERENCES.map((p) => (
              <Checkbox
                key={p}
                label={SHIFT_PREFERENCE_LABELS[p]}
                checked={draft.preferences.includes(p)}
                onChange={(e) => update("preferences", e.target.checked ? [...draft.preferences, p] : draft.preferences.filter((x) => x !== p))}
              />
            ))}
          </div>

          <h4 className="mt-4 text-[13px] font-medium text-fg-2">Time off and requests</h4>
          {openRequests.length === 0 && pastRequests.length === 0 && <p className="mt-1 text-sm text-muted">None.</p>}
          <ul className="mt-2 space-y-2">
            {openRequests.map((r) => (
              <li key={r.id} className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-sm">
                <p className="font-medium text-fg">{describeRequest(r)}</p>
                {r.note && <p className="text-fg-2">“{r.note}”</p>}
                <div className="mt-2 flex gap-2">
                  {r.kind === "time_off" ? (
                    <>
                      <Button size="sm" icon="check" loading={busyRequest === r.id} onClick={() => decide(r.id, "approved")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyRequest === r.id} onClick={() => decide(r.id, "declined")}>
                        Decline
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" icon="check" loading={busyRequest === r.id} onClick={() => decide(r.id, "resolved")}>
                      Mark as sorted
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {pastRequests.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {pastRequests.map((r) => (
                <li key={r.id}>
                  {describeRequest(r)} — {r.status}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="shifts" title="Scheduled shifts and hours">
          <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-line text-center">
            {[
              ["Week 1", hours?.week1 ?? 0],
              ["Week 2", hours?.week2 ?? 0],
              ["Fortnight", hours?.total ?? 0],
            ].map(([label, value], i) => (
              <div key={label as string} className={cn("px-2 py-2", i > 0 && "border-l border-line")}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-semibold text-fg tabular-nums">
                  {formatHours(value as number)}
                  {label === "Fortnight" && limit !== null && <span className="text-xs font-normal text-muted"> / {limit}h</span>}
                </dd>
              </div>
            ))}
          </dl>
          {hours && hours.warnings.length > 0 && (
            <Alert tone="warning" className="mt-2">
              {hours.warnings.join(" · ")}
            </Alert>
          )}
          <h4 className="mt-4 text-[13px] font-medium text-fg-2">Next two weeks</h4>
          {shifts.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Not rostered on.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {shifts.map((s, i) => (
                <li key={i}>
                  <Link href={s.href} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                    <span className="w-24 shrink-0 text-muted">{s.date === today ? "Today" : formatWeekdayDate(s.date)}</span>
                    <span className="w-24 shrink-0 font-medium text-fg tabular-nums">{s.time}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-2">
                      {s.taskName && s.taskName !== "Event staff" ? `${s.taskName} · ` : ""}
                      {s.eventName}
                    </span>
                    {s.draft && <Badge>Draft</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="notes" title="Manager notes and development" description="Only managers see these — e.g. training goals, who to pair them with. Keep medical or private details out.">
          <Textarea rows={4} maxLength={2000} value={draft.notes} onChange={(e) => update("notes", e.target.value)} aria-label="Manager notes" placeholder="e.g. Ready to start barista training; pair with Chloe" />
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
            <Icon name="lock" size={14} className="text-muted" />
            <span className="min-w-0 flex-1 text-fg-2">
              Password:{" "}
              {person.hasPassword ? (person.passwordIsPlainText ? "set (old plain-text format)" : "set") : "not set yet — they choose one when they first log in"}
            </span>
            {person.hasPassword && (
              <Button size="sm" variant="danger" onClick={resetPassword}>
                Reset password
              </Button>
            )}
          </div>
        </Section>
      </div>
    </Drawer>
  );
}
