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
import { chip, input, label, linkButton, messageClass, mutedText, primaryButton, secondaryButton, tones } from "../../ui";
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
  const { save, saving, message } = useSaver();
  const dirty = JSON.stringify(types) !== JSON.stringify(taskTypes);
  const set = (i: number, change: Partial<TaskType>) => setTypes(types.map((t, j) => (j === i ? { ...t, ...change } : t)));
  const skillList = skills.filter((s) => s.kind === "skill");
  const quals = skills.filter((s) => s.kind === "qualification");

  return (
    <div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {types.map((t, i) => (
          <li key={t.id || `new-${i}`} className={`py-2 ${t.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={t.name}
                onChange={(e) => set(i, { name: e.target.value })}
                aria-label="Task type name"
                placeholder="Name"
                className={`min-w-48 flex-1 ${input}`}
              />
              <span className={`${chip} ${tones.neutral} hidden w-40 justify-center sm:inline-flex`}>{TASK_GROUP_LABELS[t.group]}</span>
              {!t.active && <span className={`${chip} ${tones.neutral}`}>Disabled</span>}
              <button type="button" onClick={() => setTypes(move(types, i, -1))} disabled={i === 0} className={`${secondaryButton} px-2 py-1`} aria-label={`Move ${t.name} up`}>
                ↑
              </button>
              <button type="button" onClick={() => setTypes(move(types, i, 1))} disabled={i === types.length - 1} className={`${secondaryButton} px-2 py-1`} aria-label={`Move ${t.name} down`}>
                ↓
              </button>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className={linkButton} aria-expanded={open === i}>
                {open === i ? "Close" : "Edit"}
              </button>
            </div>
            {open === i && (
              <div className="mt-2 grid gap-3 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3 dark:bg-zinc-900/60">
                <label>
                  <span className={label}>Group</span>
                  <select value={t.group} onChange={(e) => set(i, { group: e.target.value as TaskGroup })} className={`mt-1 w-full ${input}`}>
                    {TASK_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {TASK_GROUP_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Usual time</span>
                  <select value={t.phase} onChange={(e) => set(i, { phase: e.target.value as TaskPhase })} className={`mt-1 w-full ${input}`}>
                    {TASK_PHASES.map((p) => (
                      <option key={p} value={p}>
                        {TASK_PHASE_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Physical demand</span>
                  <select value={t.demand} onChange={(e) => set(i, { demand: e.target.value as Demand })} className={`mt-1 w-full ${input}`}>
                    {DEMANDS.map((d) => (
                      <option key={d} value={d}>
                        {DEMAND_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Skill</span>
                  <select value={t.skillId} onChange={(e) => set(i, { skillId: e.target.value, minLevel: e.target.value ? t.minLevel : "" })} className={`mt-1 w-full ${input}`}>
                    <option value="">None</option>
                    {skillList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Minimum level</span>
                  <select value={t.minLevel} disabled={!t.skillId} onChange={(e) => set(i, { minLevel: e.target.value as SkillLevel | "" })} className={`mt-1 w-full ${input}`}>
                    <option value="">Anyone (experienced first)</option>
                    {SKILL_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {SKILL_LEVEL_LABELS[l]} or above
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={label}>Done as a team of</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={t.minTeam}
                    onChange={(e) => set(i, { minTeam: Math.max(1, Math.min(10, Math.floor(Number(e.target.value) || 1))) })}
                    className={`mt-1 w-full ${input}`}
                  />
                </label>
                <fieldset className="sm:col-span-2 lg:col-span-3">
                  <legend className={label}>Qualifications required</legend>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {quals.map((q) => (
                      <label key={q.id} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={t.qualificationIds.includes(q.id)}
                          onChange={(e) =>
                            set(i, {
                              qualificationIds: e.target.checked ? [...t.qualificationIds, q.id] : t.qualificationIds.filter((x) => x !== q.id),
                            })
                          }
                        />
                        {q.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="sm:col-span-2 lg:col-span-3">
                  <span className={label}>Safety controls or equipment needed</span>
                  <input value={t.controls} onChange={(e) => set(i, { controls: e.target.value })} placeholder="e.g. Trolleys or table lifters" className={`mt-1 w-full ${input}`} />
                </label>
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={t.needsSupervisor} onChange={(e) => set(i, { needsSupervisor: e.target.checked })} />
                    Needs a supervisor or team leader on the event
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={t.leadership} onChange={(e) => set(i, { leadership: e.target.checked })} />
                    Is a supervisor / team leader role
                  </label>
                  <label className={`flex items-center gap-2 ${isSafetyCritical(t) ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      disabled={isSafetyCritical(t)}
                      checked={t.combinable && !isSafetyCritical(t)}
                      onChange={(e) => set(i, { combinable: e.target.checked })}
                    />
                    Can be combined with another combinable task {isSafetyCritical(t) && "(not for heavy or team work)"}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} />
                    Active (disabled types aren&apos;t offered for new events)
                  </label>
                  {!t.id && (
                    <button type="button" onClick={() => setTypes(types.filter((_, j) => j !== i))} className={`${linkButton} self-start text-red-600`}>
                      Remove this new type
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setTypes([...types, blank()]); setOpen(types.length); }} className={secondaryButton}>
          + New task type
        </button>
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => save("/api/admin/config/task-types", { taskTypes: types }, "Task types saved.")}
          className={primaryButton}
        >
          {saving ? "Saving…" : "Save task types"}
        </button>
        {dirty && <span className={`text-sm ${mutedText}`}>Unsaved changes</span>}
        {message && <span className={`text-sm ${messageClass(message.type)}`}>{message.text}</span>}
      </div>
    </div>
  );
}
