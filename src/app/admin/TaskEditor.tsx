"use client";

import { useState } from "react";
import { formatMinutes } from "@/lib/dates";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, type SkillDef, type SkillLevel } from "@/lib/skills";
import {
  DEMANDS,
  DEMAND_LABELS,
  type Demand,
  type EventTask,
  type EventTimes,
  type TaskType,
  GENERAL_TASK_ID,
  TASK_GROUPS,
  TASK_GROUP_LABELS,
  isSafetyCritical,
  phaseWindow,
  taskFromType,
  uniqueTaskId,
  uniqueTaskName,
} from "@/lib/tasks";
import { type EventTemplate, tasksFromTemplate } from "@/lib/templates";
import { chip, input, label, linkButton, mutedText, secondaryButton, tones, warningText } from "../ui";

interface Props {
  tasks: EventTask[];
  onChange: (tasks: EventTask[]) => void;
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
  times: EventTimes | null; // the event's times, for default task times; null until they're set
  peopleOn?: Record<string, number>; // task id → people rostered (those tasks can't be removed)
  disabled?: boolean;
}

export function requirementBadges(task: EventTask, skills: SkillDef[]): { text: string; tone: keyof typeof tones }[] {
  const badges: { text: string; tone: keyof typeof tones }[] = [];
  const name = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  if (!task.mandatory) badges.push({ text: "Optional", tone: "neutral" });
  if (task.skillId && task.minLevel) badges.push({ text: `${name(task.skillId)}: ${SKILL_LEVEL_LABELS[task.minLevel]}+`, tone: "info" });
  for (const q of task.qualificationIds) badges.push({ text: `Needs ${name(q).replace(/ \(.*\)$/, "")}`, tone: "info" });
  if (task.demand !== "low") badges.push({ text: DEMAND_LABELS[task.demand], tone: task.demand === "high" ? "warn" : "neutral" });
  if (task.minTeam > 1) badges.push({ text: `Team of ${task.minTeam}`, tone: "warn" });
  if (task.controls) badges.push({ text: task.controlsConfirmed ? "Controls confirmed" : "Confirm controls", tone: task.controlsConfirmed ? "good" : "warn" });
  if (task.needsSupervisor) badges.push({ text: "Needs supervisor", tone: "neutral" });
  if (task.leadership) badges.push({ text: "Leadership", tone: "neutral" });
  if (task.combinable && !isSafetyCritical(task)) badges.push({ text: "Can combine", tone: "neutral" });
  return badges;
}

function Advanced({
  task,
  skills,
  onChange,
  disabled,
}: {
  task: EventTask;
  skills: SkillDef[];
  onChange: (change: Partial<EventTask>) => void;
  disabled: boolean;
}) {
  const active = skills.filter((s) => s.active || s.id === task.skillId || task.qualificationIds.includes(s.id));
  const critical = isSafetyCritical(task);
  return (
    <div className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-2 dark:bg-zinc-900/60">
      <label className="sm:col-span-2">
        <span className={label}>Instructions for staff</span>
        <textarea
          rows={2}
          value={task.notes}
          disabled={disabled}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="e.g. Round tables of 10, white linen"
          className={`mt-1 w-full ${input}`}
        />
      </label>
      <label>
        <span className={label}>Skill</span>
        <select
          value={task.skillId}
          disabled={disabled}
          onChange={(e) => onChange({ skillId: e.target.value, minLevel: e.target.value ? task.minLevel : "" })}
          className={`mt-1 w-full ${input}`}
        >
          <option value="">None</option>
          {active.filter((s) => s.kind === "skill").map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Minimum level</span>
        <select
          value={task.minLevel}
          disabled={disabled || !task.skillId}
          onChange={(e) => onChange({ minLevel: e.target.value as SkillLevel | "" })}
          className={`mt-1 w-full ${input}`}
        >
          <option value="">Anyone (experienced first)</option>
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>
              {SKILL_LEVEL_LABELS[l]} or above
            </option>
          ))}
        </select>
      </label>
      <fieldset className="sm:col-span-2">
        <legend className={label}>Qualifications required (must be current)</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {active.filter((s) => s.kind === "qualification").map((q) => (
            <label key={q.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4"
                disabled={disabled}
                checked={task.qualificationIds.includes(q.id)}
                onChange={(e) =>
                  onChange({
                    qualificationIds: e.target.checked
                      ? [...task.qualificationIds, q.id]
                      : task.qualificationIds.filter((id) => id !== q.id),
                  })
                }
              />
              {q.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span className={label}>Physical demand</span>
        <select
          value={task.demand}
          disabled={disabled}
          onChange={(e) => onChange({ demand: e.target.value as Demand })}
          className={`mt-1 w-full ${input}`}
        >
          {DEMANDS.map((d) => (
            <option key={d} value={d}>
              {DEMAND_LABELS[d]}
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
          value={task.minTeam}
          disabled={disabled}
          onChange={(e) => {
            const minTeam = Math.max(1, Math.min(10, Math.floor(Number(e.target.value) || 1)));
            onChange({ minTeam, count: Math.max(task.count, minTeam) });
          }}
          className={`mt-1 w-full ${input}`}
        />
        <span className={`mt-0.5 block text-xs ${mutedText}`}>2 or more for team lifting</span>
      </label>
      <label className="sm:col-span-2">
        <span className={label}>Safety controls or equipment needed</span>
        <input
          value={task.controls}
          disabled={disabled}
          onChange={(e) => onChange({ controls: e.target.value, controlsConfirmed: false })}
          placeholder="e.g. Table trolleys; lift staging in pairs"
          className={`mt-1 w-full ${input}`}
        />
        <span className={`mt-0.5 block text-xs ${mutedText}`}>
          Generate won&apos;t fill this task until someone confirms these are in place. Where you can, reduce the load
          or use equipment rather than relying on manual lifting.
        </span>
      </label>
      {task.controls && (
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            disabled={disabled}
            checked={task.controlsConfirmed}
            onChange={(e) => onChange({ controlsConfirmed: e.target.checked })}
          />
          The controls are arranged for this event
        </label>
      )}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" disabled={disabled} checked={task.mandatory} onChange={(e) => onChange({ mandatory: e.target.checked })} />
          Mandatory (unticked: filled after everything else, never counts as a gap)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" disabled={disabled} checked={task.needsSupervisor} onChange={(e) => onChange({ needsSupervisor: e.target.checked })} />
          A supervisor or team leader must be on the event during it
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" disabled={disabled} checked={task.leadership} onChange={(e) => onChange({ leadership: e.target.checked })} />
          This is a supervisor / team leader role
        </label>
        <label className={`flex items-center gap-2 ${critical ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            className="h-4 w-4"
            disabled={disabled || critical}
            checked={task.combinable && !critical}
            onChange={(e) => onChange({ combinable: e.target.checked })}
          />
          Its staff may do another combinable task at the same time
          {critical && <span className={`text-xs ${mutedText}`}>(not for heavy or team work)</span>}
        </label>
      </div>
    </div>
  );
}

// Add, remove and adjust an event's tasks: headcount and times up front,
// requirements under "Details".
export default function TaskEditor({ tasks, onChange, taskTypes, skills, templates, times, peopleOn = {}, disabled = false }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [typeToAdd, setTypeToAdd] = useState("");
  const active = taskTypes.filter((t) => t.active);

  const update = (id: string, change: Partial<EventTask>) =>
    onChange(tasks.map((t) => (t.id === id ? { ...t, ...change } : t)));

  // A lone untouched "Event staff" task (with no one on it) is replaced by the first real task.
  const replaceable = (list: EventTask[]) =>
    list.length === 1 && list[0].id === GENERAL_TASK_ID && list[0].typeId === "" && !peopleOn[GENERAL_TASK_ID];

  function addType(id: string) {
    const type = taskTypes.find((t) => t.id === id);
    if (!type || !times) return;
    const base = replaceable(tasks) ? [] : tasks;
    const task = taskFromType(type, 1, phaseWindow(type.phase, times), base, formatMinutes);
    onChange([...base, task]);
    setOpen(task.id);
    setTypeToAdd("");
  }

  function addTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template || !times) return;
    const base = replaceable(tasks) ? [] : tasks;
    const added: EventTask[] = [];
    for (const task of tasksFromTemplate(template, taskTypes, times)) {
      const all = [...base, ...added];
      added.push({ ...task, id: uniqueTaskId(all), name: uniqueTaskName(task.name, all) });
    }
    onChange([...base, ...added]);
  }

  function addBlank() {
    if (!times) return;
    const base = replaceable(tasks) ? [] : tasks;
    const task: EventTask = {
      id: uniqueTaskId(base),
      typeId: "",
      name: uniqueTaskName("Custom task", base),
      count: 1,
      startTime: formatMinutes(times.start),
      endTime: formatMinutes(times.end),
      notes: "",
      mandatory: true,
      controlsConfirmed: false,
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
    onChange([...base, task]);
    setOpen(task.id);
  }

  return (
    <div>
      {tasks.length === 0 ? (
        <p className={`text-sm ${mutedText}`}>No tasks yet — add them below, or start from a template.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const people = peopleOn[task.id] ?? 0;
            const general = task.id === GENERAL_TASK_ID && !task.startTime;
            return (
              <li key={task.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-40 flex-1">
                    <span className="sr-only">Task name</span>
                    <input
                      value={task.name}
                      disabled={disabled}
                      onChange={(e) => update(task.id, { name: e.target.value })}
                      className={`w-full font-medium ${input}`}
                    />
                  </label>
                  <div className="flex items-center gap-1" role="group" aria-label={`Workers needed for ${task.name}`}>
                    <button
                      type="button"
                      disabled={disabled || task.count <= (task.minTeam > 1 ? task.minTeam : 0)}
                      onClick={() => update(task.id, { count: task.count - 1 })}
                      className={`${secondaryButton} h-9 w-9 px-0`}
                      aria-label="One fewer"
                    >
                      −
                    </button>
                    <span className="w-14 text-center text-sm tabular-nums">
                      <span className="font-semibold">{task.count}</span> {task.count === 1 ? "person" : "people"}
                    </span>
                    <button
                      type="button"
                      disabled={disabled || task.count >= 100}
                      onClick={() => update(task.id, { count: task.count + 1 })}
                      className={`${secondaryButton} h-9 w-9 px-0`}
                      aria-label="One more"
                    >
                      +
                    </button>
                  </div>
                  {general ? (
                    <span className={`text-sm ${mutedText}`}>Whole shift (setup → pack-down)</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="time"
                        aria-label={`${task.name} starts`}
                        value={task.startTime}
                        disabled={disabled}
                        onChange={(e) => update(task.id, { startTime: e.target.value })}
                        className={`w-[7.5rem] ${input}`}
                      />
                      <span className={mutedText}>–</span>
                      <input
                        type="time"
                        aria-label={`${task.name} ends`}
                        value={task.endTime}
                        disabled={disabled}
                        onChange={(e) => update(task.id, { endTime: e.target.value })}
                        className={`w-[7.5rem] ${input}`}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={disabled || people > 0}
                    onClick={() => onChange(tasks.filter((t) => t.id !== task.id))}
                    title={people > 0 ? "Take the people off this task first" : "Remove task"}
                    className="rounded-lg px-2 py-2 text-zinc-400 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                    aria-label={`Remove ${task.name}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {requirementBadges(task, skills).map((b) => (
                    <span key={b.text} className={`${chip} ${tones[b.tone]}`}>
                      {b.text}
                    </span>
                  ))}
                  {people > 0 && <span className={`text-xs ${mutedText}`}>{people} rostered</span>}
                  <button type="button" onClick={() => setOpen(open === task.id ? null : task.id)} className={`${linkButton} text-xs`} aria-expanded={open === task.id}>
                    {open === task.id ? "Hide details" : "Details & requirements"}
                  </button>
                </div>
                {task.minTeam > 1 && task.count < task.minTeam && (
                  <p className={`mt-1 text-xs ${warningText}`}>Needs at least {task.minTeam} people, as it&apos;s team work.</p>
                )}
                {open === task.id && (
                  <Advanced task={task} skills={skills} disabled={disabled} onChange={(change) => update(task.id, change)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={typeToAdd}
          disabled={disabled || !times}
          onChange={(e) => {
            setTypeToAdd(e.target.value);
            if (e.target.value) addType(e.target.value);
          }}
          className={`${input} min-w-48 flex-1 sm:flex-none`}
          aria-label="Add a task"
        >
          <option value="">+ Add a task…</option>
          {TASK_GROUPS.map((group) => (
            <optgroup key={group} label={TASK_GROUP_LABELS[group]}>
              {active.filter((t) => t.group === group).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" disabled={disabled || !times} onClick={addBlank} className={secondaryButton}>
          + Custom task
        </button>
        {templates.length > 0 && (
          <select
            value=""
            disabled={disabled || !times}
            onChange={(e) => e.target.value && addTemplate(e.target.value)}
            className={`${input} min-w-48 flex-1 sm:flex-none`}
            aria-label="Add the tasks from a template"
          >
            <option value="">Add from a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!times && <p className={`mt-1 text-xs ${mutedText}`}>Set the event&apos;s start and end first.</p>}
    </div>
  );
}
