"use client";

import { useState } from "react";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, type SkillDef, type SkillLevel } from "@/lib/skills";
import {
  DEMANDS,
  DEMAND_LABELS,
  type Demand,
  TASK_GROUPS,
  TASK_GROUP_LABELS,
  TASK_PHASES,
  TASK_PHASE_LABELS,
  type TaskGroup,
  type TaskPhase,
  type TaskType,
  isSafetyCritical,
} from "@/lib/tasks";
import { requirementBadges } from "../events/TaskEditor";
import { Badge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Checkbox, Field, Input, Select } from "../ui/Field";
import { cn } from "../ui/cn";
import { SaveBar } from "./SaveBar";
import { move, useSaver } from "./useSaver";

function blank(): TaskType {
  return {
    id: "",
    name: "",
    group: "service",
    phase: "event",
    active: true,
    skillId: "",
    minLevel: "",
    qualificationIds: [],
    demand: "low",
    minTeam: 1,
    controls: "",
    needsSupervisor: false,
    leadership: false,
    combinable: false,
  };
}

// Reusable task types: rename, disable, reorder, and set what each needs.
// Events keep their own copy, so a change here only affects tasks added later.
export default function TaskTypesEditor({ taskTypes, skills }: { taskTypes: TaskType[]; skills: SkillDef[] }) {
  const [types, setTypes] = useState(taskTypes);
  const [open, setOpen] = useState<number | null>(null);
  const { save, saving, error } = useSaver();
  const dirty = JSON.stringify(types) !== JSON.stringify(taskTypes);
  const set = (i: number, change: Partial<TaskType>) => setTypes(types.map((t, j) => (j === i ? { ...t, ...change } : t)));
  const skillList = skills.filter((s) => s.kind === "skill");
  const quals = skills.filter((s) => s.kind === "qualification");

  return (
    <div>
      {TASK_GROUPS.map((group) => {
        const items = types.map((t, i) => ({ t, i })).filter(({ t }) => t.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="mb-4">
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{TASK_GROUP_LABELS[group]}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {items.map(({ t, i }) => {
                const badges = requirementBadges({ ...t, id: t.id, typeId: t.id, count: 1, startTime: "", endTime: "", notes: "", mandatory: true, controlsConfirmed: false }, skills).filter(
                  (b) => b.text !== "Confirm controls"
                );
                return (
                  <li key={t.id || `new-${i}`} className={cn("px-3 py-2.5", !t.active && "bg-surface-2")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input value={t.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Task type name" placeholder="Name" className="min-w-48 flex-1 font-medium" />
                      {!t.active && <Badge>Disabled</Badge>}
                      <span className="flex">
                        <IconButton icon="chevronUp" size="sm" label={`Move ${t.name || "task type"} up`} disabled={i === 0} onClick={() => setTypes(move(types, i, -1))} />
                        <IconButton icon="chevronDown" size="sm" label={`Move ${t.name || "task type"} down`} disabled={i === types.length - 1} onClick={() => setTypes(move(types, i, 1))} />
                      </span>
                      <Button size="sm" variant={open === i ? "secondary" : "ghost"} icon="pencil" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                        {open === i ? "Done" : "Edit"}
                      </Button>
                    </div>
                    {open !== i && badges.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {badges.map((b) => (
                          <Badge key={b.text} tone={b.tone}>
                            {b.text}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {open === i && (
                      <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Group">
                          <Select value={t.group} onChange={(e) => set(i, { group: e.target.value as TaskGroup })}>
                            {TASK_GROUPS.map((g) => (
                              <option key={g} value={g}>
                                {TASK_GROUP_LABELS[g]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Usual time">
                          <Select value={t.phase} onChange={(e) => set(i, { phase: e.target.value as TaskPhase })}>
                            {TASK_PHASES.map((p) => (
                              <option key={p} value={p}>
                                {TASK_PHASE_LABELS[p]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Physical demand">
                          <Select value={t.demand} onChange={(e) => set(i, { demand: e.target.value as Demand })}>
                            {DEMANDS.map((d) => (
                              <option key={d} value={d}>
                                {DEMAND_LABELS[d]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Skill">
                          <Select value={t.skillId} onChange={(e) => set(i, { skillId: e.target.value, minLevel: e.target.value ? t.minLevel : "" })}>
                            <option value="">None</option>
                            {skillList.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Minimum level">
                          <Select value={t.minLevel} disabled={!t.skillId} onChange={(e) => set(i, { minLevel: e.target.value as SkillLevel | "" })}>
                            <option value="">Anyone (experienced first)</option>
                            {SKILL_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {SKILL_LEVEL_LABELS[l]} or above
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Done as a team of" hint="2 or more for team lifting">
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={t.minTeam}
                            onChange={(e) => set(i, { minTeam: Math.max(1, Math.min(10, Math.floor(Number(e.target.value) || 1))) })}
                          />
                        </Field>
                        <fieldset className="sm:col-span-2 lg:col-span-3">
                          <legend className="mb-1 text-[13px] font-medium text-fg-2">Qualifications required</legend>
                          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                            {quals.map((q) => (
                              <Checkbox
                                key={q.id}
                                label={q.name}
                                checked={t.qualificationIds.includes(q.id)}
                                onChange={(e) => set(i, { qualificationIds: e.target.checked ? [...t.qualificationIds, q.id] : t.qualificationIds.filter((x) => x !== q.id) })}
                              />
                            ))}
                          </div>
                        </fieldset>
                        <Field label="Safety controls or equipment needed" optional className="sm:col-span-2 lg:col-span-3">
                          <Input value={t.controls} onChange={(e) => set(i, { controls: e.target.value })} placeholder="e.g. Trolleys or table lifters" />
                        </Field>
                        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
                          <Checkbox label="Needs a supervisor or team leader on the event" checked={t.needsSupervisor} onChange={(e) => set(i, { needsSupervisor: e.target.checked })} />
                          <Checkbox label="Is a supervisor or team leader role" checked={t.leadership} onChange={(e) => set(i, { leadership: e.target.checked })} />
                          <Checkbox
                            label="Can be combined with another combinable task"
                            description={isSafetyCritical(t) ? "Not available for heavy or team work" : undefined}
                            disabled={isSafetyCritical(t)}
                            checked={t.combinable && !isSafetyCritical(t)}
                            onChange={(e) => set(i, { combinable: e.target.checked })}
                          />
                          <Checkbox label="Active" description="Disabled types aren't offered for new events." checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} />
                          {!t.id && (
                            <Button size="sm" variant="danger" icon="trash" className="self-start" onClick={() => setTypes(types.filter((_, j) => j !== i))}>
                              Remove this new type
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <SaveBar
        label="Save task types"
        dirty={dirty}
        saving={saving}
        error={error}
        onReset={() => setTypes(taskTypes)}
        onSave={() => save("/api/admin/config/task-types", { taskTypes: types }, "Task types saved.")}
        extra={
          <Button
            icon="plus"
            onClick={() => {
              setTypes([...types, blank()]);
              setOpen(types.length);
            }}
          >
            New task type
          </Button>
        }
      />
    </div>
  );
}
