"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AWARD_LEVELS, AWARD_LEVEL_NAMES, type AwardLevel } from "@/lib/award";
import { DAYS, type DayAvailability, availabilityGiven } from "@/lib/availability";
import { formatHours } from "@/lib/dates";
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, type EmploymentType, STUDENT_MAX_FORTNIGHT_HOURS, softFortnightLimit } from "@/lib/employment";
import type { HoursSummary } from "@/lib/roster";
import { RECORD_LEVEL_LABELS, type SkillDef, levelRank } from "@/lib/skills";
import type { StaffMember } from "@/lib/staff";
import { send } from "../admin/api";
import { PageHeader } from "../shell/PageHeader";
import { Alert } from "../ui/Alert";
import { Badge, type Tone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, SearchInput, Select } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Dialog } from "../ui/Overlay";
import { cn } from "../ui/cn";
import { useToast } from "../ui/feedback";
import StaffProfile, { type UpcomingShift } from "./StaffProfile";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg-2"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function dayLook(day: DayAvailability): { fill: string; text: string } {
  if (day.status === "available_all_day") return { fill: "bg-success", text: "all day" };
  if (day.status === "custom") return { fill: "bg-success/50", text: `${day.startTime}–${day.endTime}` };
  return { fill: "bg-surface-3", text: "unavailable" };
}

// Seven small blocks, Monday to Sunday, with the times in text for screen
// readers and on hover.
export function WeekDots({ person }: { person: StaffMember }) {
  if (!availabilityGiven(person.week, person.updatedAt)) return <span className="text-xs text-subtle">Not set yet</span>;
  return (
    <span className="flex gap-0.5" aria-label={DAYS.map((d) => `${d}: ${dayLook(person.week[d]).text}`).join("; ")} role="img">
      {DAYS.map((d) => {
        const look = dayLook(person.week[d]);
        return (
          <span key={d} title={`${d}: ${look.text}`} className="flex flex-col items-center gap-0.5">
            <span className={cn("h-3.5 w-3.5 rounded-[3px] border border-line", look.fill)} />
            <span className="text-[9px] leading-none text-subtle">{d[0]}</span>
          </span>
        );
      })}
    </span>
  );
}

function topSkills(person: StaffMember, skills: SkillDef[], today: string) {
  return Object.entries(person.skills)
    .filter(([id, r]) => skills.find((s) => s.id === id)?.kind === "skill" && r.level !== "not_yet" && (!r.expiresOn || r.expiresOn >= today))
    .sort((a, b) => levelRank(b[1].level) - levelRank(a[1].level))
    .map(([id, r]) => ({ name: (skills.find((s) => s.id === id)?.name ?? id).replace(/ \(.*\)$/, ""), level: r.level }));
}

function profileFlags(person: StaffMember, today: string): { text: string; tone: Tone }[] {
  const flags: { text: string; tone: Tone }[] = [];
  if (!person.active) flags.push({ text: "Inactive", tone: "neutral" });
  if (person.unreadable.length) flags.push({ text: "Check sheet", tone: "danger" });
  const expired = Object.values(person.skills).some((r) => r.expiresOn && r.expiresOn < today);
  if (expired) flags.push({ text: "Expired record", tone: "danger" });
  if (!person.awardLevel) flags.push({ text: "No award level", tone: "warning" });
  const pending = person.requests.filter((r) => r.status === "pending").length;
  if (pending) flags.push({ text: `${pending} request${pending === 1 ? "" : "s"}`, tone: "info" });
  if (person.restrictions.some((r) => !r.until || r.until >= today)) flags.push({ text: "Restriction", tone: "warning" });
  if (!availabilityGiven(person.week, person.updatedAt)) flags.push({ text: "No availability", tone: "neutral" });
  return flags;
}

function HoursCell({ person, row }: { person: StaffMember; row: HoursSummary | undefined }) {
  const limit = person.employmentType === "student" ? STUDENT_MAX_FORTNIGHT_HOURS : softFortnightLimit(person.employmentType);
  const warn = (row?.warnings.length ?? 0) > 0;
  return (
    <span className={cn("tabular-nums", warn ? "text-warning" : "text-fg-2")} title={row?.warnings.join(" · ") || undefined}>
      {warn && <Icon name="alert" size={12} className="mr-1 inline" />}
      {formatHours(row?.total ?? 0)}
      {limit !== null && <span className="text-muted"> / {limit}h</span>}
    </span>
  );
}

function AddStaffDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<EmploymentType>("casual");
  const [level, setLevel] = useState<AwardLevel | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const result = await send("/api/admin/staff", "POST", { name: name.trim(), employmentType: type, awardLevel: level });
    setSaving(false);
    if (!result.ok) setError(result.error);
    else onAdded(name.trim());
  }

  return (
    <Dialog
      size="sm"
      title="Add staff member"
      subtitle="They choose their own password and availability on the staff page."
      onClose={onClose}
      footer={
        <>
          <Button type="submit" form="add-staff" variant="primary" loading={saving}>
            Add staff member
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="add-staff" onSubmit={add} className="space-y-4">
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <Field label="Full name" error={tried && !name.trim() ? "Enter their name" : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus data-autofocus />
        </Field>
        <Field label="Employment type">
          <Select value={type} onChange={(e) => setType(e.target.value as EmploymentType)}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Award level" hint="Sets their minimum pay in the wage estimates. You can set it later.">
          <Select value={level} onChange={(e) => setLevel(e.target.value as AwardLevel | "")}>
            <option value="">Not set</option>
            {AWARD_LEVELS.map((l) => (
              <option key={l} value={l}>
                {AWARD_LEVEL_NAMES[l]}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

export default function StaffDirectory({
  staff,
  skills,
  rates,
  hours,
  shifts,
  today,
  initialPerson,
}: {
  staff: StaffMember[];
  skills: SkillDef[];
  rates: Record<AwardLevel, number>;
  hours: HoursSummary[];
  shifts: Record<string, UpcomingShift[]>; // lower-case name → their next two weeks
  today: string;
  initialPerson: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [type, setType] = useState<EmploymentType | "">("");
  const [skill, setSkill] = useState("");
  const [openName, setOpenName] = useState<string | null>(initialPerson);
  const [adding, setAdding] = useState(false);
  const [securing, setSecuring] = useState(false);

  const plainText = staff.filter((s) => s.passwordIsPlainText).length;
  const q = search.trim().toLowerCase();
  const shown = staff.filter((s) => {
    if (status === "active" && !s.active) return false;
    if (status === "inactive" && s.active) return false;
    if (type && s.employmentType !== type) return false;
    if (skill) {
      const r = s.skills[skill];
      if (!r || r.level === "not_yet" || (r.expiresOn && r.expiresOn < today)) return false;
    }
    return !q || s.staffName.toLowerCase().includes(q) || s.employeeId.toLowerCase().includes(q);
  });
  const open = staff.find((s) => s.staffName.toLowerCase() === openName?.toLowerCase()) ?? null;
  const filtering = Boolean(q || type || skill || status !== "active");

  const refresh = () => startRefresh(() => router.refresh());
  const choose = (name: string | null) => {
    setOpenName(name);
    const url = new URL(window.location.href);
    if (name) url.searchParams.set("person", name);
    else url.searchParams.delete("person");
    window.history.replaceState(null, "", url);
  };

  async function securePasswords() {
    setSecuring(true);
    const result = await send<{ secured: number }>("/api/admin/staff/secure-passwords", "POST");
    setSecuring(false);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(`Secured ${result.data.secured} password${result.data.secured === 1 ? "" : "s"}. They work as before.`);
      refresh();
    }
  }

  return (
    <>
      <PageHeader
        description="Everyone who can be rostered, in the sheet's order. Open a profile to record skills, qualifications, restrictions and notes."
        actions={
          <Button variant="primary" icon="userPlus" onClick={() => setAdding(true)}>
            Add staff
          </Button>
        }
      />

      {plainText > 0 && (
        <Alert
          tone="warning"
          className="mb-4"
          title={`${plainText} staff password${plainText === 1 ? " is" : "s are"} still stored as plain text in the sheet`}
          action={
            <Button size="sm" loading={securing} onClick={securePasswords}>
              Secure them now
            </Button>
          }
        >
          Left by the previous version. Securing replaces {plainText === 1 ? "it" : "them"} with a one-way hash; nobody&apos;s password changes.
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Name or employee ID" label="Find staff" className="w-full sm:w-60" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className="w-full sm:w-36">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">Everyone</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as EmploymentType | "")} aria-label="Employment type" className="w-full sm:w-40">
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill or qualification" className="w-full sm:w-56">
            <option value="">Any skill or qualification</option>
            <optgroup label="Skills">
              {skills.filter((s) => s.kind === "skill" && s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Qualifications (current)">
              {skills.filter((s) => s.kind === "qualification" && s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </Select>
          <span className="ml-auto text-xs text-muted tabular-nums">
            {shown.length} of {staff.length}
            {refreshing && " · updating…"}
          </span>
        </div>

        {staff.length === 0 ? (
          <EmptyState
            icon="users"
            title="No staff yet"
            action={
              <Button variant="primary" icon="userPlus" onClick={() => setAdding(true)}>
                Add staff
              </Button>
            }
          >
            Add people here, or they appear when they first enter their availability on the staff page.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState compact icon="filter" title="No one matches" action={filtering ? <Button size="sm" onClick={() => { setSearch(""); setType(""); setSkill(""); setStatus("active"); }}>Clear filters</Button> : undefined} />
        ) : (
          <>
            <div className="hidden max-h-[70vh] overflow-auto md:block">
              <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    {["Employee", "Skills", "Type", "Availability", "This fortnight", "Profile", ""].map((h, i) => (
                      <th key={i} scope="col" className="sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-2 font-medium first:pl-4 last:pr-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((person) => {
                    const top = topSkills(person, skills, today);
                    return (
                      <tr key={person.staffName} className={cn("cursor-pointer hover:bg-surface-2", !person.active && "opacity-60")} onClick={() => choose(person.staffName)}>
                        <td className="border-b border-line py-2.5 pr-3 pl-4">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={person.staffName} />
                            <span className="min-w-0">
                              <button type="button" onClick={() => choose(person.staffName)} className="block truncate text-left font-medium text-fg hover:underline">
                                {person.staffName}
                              </button>
                              <span className="text-xs text-muted">{person.employeeId ? `ID ${person.employeeId}` : "No employee ID"}</span>
                            </span>
                          </span>
                        </td>
                        <td className="border-b border-line px-3 py-2.5">
                          {top.length === 0 ? (
                            <span className="text-xs text-subtle">None verified</span>
                          ) : (
                            <span className="flex max-w-72 flex-wrap gap-1">
                              {top.slice(0, 3).map((s) => (
                                <Badge key={s.name} tone={levelRank(s.level) >= 3 ? "info" : "neutral"}>
                                  {s.name} · {RECORD_LEVEL_LABELS[s.level].replace(" / authorised", "")}
                                </Badge>
                              ))}
                              {top.length > 3 && <span className="self-center text-xs text-muted">+{top.length - 3}</span>}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-line px-3 py-2.5 whitespace-nowrap">
                          <span className="block text-fg-2">{EMPLOYMENT_LABELS[person.employmentType]}</span>
                          <span className={cn("text-xs", person.awardLevel ? "text-muted" : "text-warning")}>
                            {person.awardLevel ? AWARD_LEVEL_NAMES[person.awardLevel] : "No award level"}
                          </span>
                        </td>
                        <td className="border-b border-line px-3 py-2.5">
                          <WeekDots person={person} />
                        </td>
                        <td className="border-b border-line px-3 py-2.5 whitespace-nowrap">
                          <HoursCell person={person} row={hours.find((h) => h.staffName.toLowerCase() === person.staffName.toLowerCase())} />
                        </td>
                        <td className="border-b border-line px-3 py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {profileFlags(person, today).map((f) => (
                              <Badge key={f.text} tone={f.tone}>
                                {f.text}
                              </Badge>
                            ))}
                            {profileFlags(person, today).length === 0 && <span className="text-xs text-success">✓ Complete</span>}
                          </span>
                        </td>
                        <td className="border-b border-line py-2.5 pr-4 pl-3 text-right">
                          <Icon name="chevronRight" size={16} className="inline text-subtle" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {shown.map((person) => {
                const top = topSkills(person, skills, today);
                return (
                  <li key={person.staffName}>
                    <button type="button" onClick={() => choose(person.staffName)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2", !person.active && "opacity-60")}>
                      <Avatar name={person.staffName} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-fg">{person.staffName}</span>
                          <HoursCell person={person} row={hours.find((h) => h.staffName.toLowerCase() === person.staffName.toLowerCase())} />
                        </span>
                        <span className="block text-xs text-muted">
                          {EMPLOYMENT_LABELS[person.employmentType]} · {person.awardLevel ? AWARD_LEVEL_NAMES[person.awardLevel] : "no award level"}
                          {top.length > 0 && ` · ${top.slice(0, 2).map((s) => s.name).join(", ")}`}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <WeekDots person={person} />
                          {profileFlags(person, today).slice(0, 2).map((f) => (
                            <Badge key={f.text} tone={f.tone}>
                              {f.text}
                            </Badge>
                          ))}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <p className="mt-2 text-xs text-muted">
        To stop rostering someone, mark them inactive on their profile — their history and pay records stay. Deleting their row in the
        Google Sheet removes them completely.
      </p>

      {open && (
        <StaffProfile
          key={open.staffName}
          person={open}
          skills={skills}
          rates={rates}
          today={today}
          hours={hours.find((h) => h.staffName.toLowerCase() === open.staffName.toLowerCase())}
          shifts={shifts[open.staffName.toLowerCase()] ?? []}
          onClose={() => choose(null)}
          onSaved={refresh}
        />
      )}
      {adding && (
        <AddStaffDialog
          onClose={() => setAdding(false)}
          onAdded={(name) => {
            setAdding(false);
            toast.success(`Added ${name}. Record their skills on their profile.`);
            refresh();
            choose(name);
          }}
        />
      )}
    </>
  );
}
