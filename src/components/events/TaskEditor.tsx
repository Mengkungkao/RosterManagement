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
import { Badge, type Tone } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Checkbox, Field, Input, Select, Stepper, Textarea } from "../ui/Field";
import { cn } from "../ui/cn";

export function requirementBadges(task: EventTask, skills: SkillDef[]): { text: string; tone: Tone }[] {
  const badges: { text: string; tone: Tone }[] = [];
  const name = (id: string) => (skills.find((s) => s.id === id)?.name ?? id).replace(/ \(.*\)$/, "");
  if (!task.mandatory) badges.push({ text: "Optional", tone: "neutral" });
  if (task.skillId && task.minLevel) badges.push({ text: `${name(task.skillId)}: ${SKILL_LEVEL_LABELS[task.minLevel]}+`, tone: "info" });
  else if (task.skillId) badges.push({ text: `Prefers ${name(task.skillId)} experience`, tone: "neutral" });
  for (const q of task.qualificationIds) badges.push({ text: `Needs ${name(q)}`, tone: "info" });
  if (task.demand !== "low") badges.push({ text: DEMAND_LABELS[task.demand], tone: task.demand === "high" ? "warning" : "neutral" });
  if (task.minTeam > 1) badges.push({ text: `Team of ${task.minTeam}`, tone: "warning" });
  if (task.controls) badges.push({ text: task.controlsConfirmed ? "Controls confirmed" : "Confirm controls", tone: task.controlsConfirmed ? "success" : "warning" });
  if (task.needsSupervisor) badges.push({ text: "Needs supervisor", tone: "neutral" });
  if (task.leadership) badges.push({ text: "Leadership", tone: "neutral" });
  if (task.combinable && !isSafetyCritical(task)) badges.push({ text: "Can combine", tone: "neutral" });
  return badges;
}

// Problems with one task as entered, shown next to it.
export function taskErrors(task: EventTask, all: EventTask[]): Partial<Record<"name" | "times" | "count", string>> {
  const errors: Partial<Record<"name" | "times" | "count", string>> = {};
  if (!task.name.trim()) errors.name = "Give the task a name";
  else if (all.some((t) => t !== task && t.name.trim().toLowerCase() === task.name.trim().toLowerCase())) {
    errors.name = "Another task has this name";
  }
  const timed = task.startTime || task.endTime;
  if (timed && (!/^\d\d:\d\d$/.test(task.startTime) || !/^\d\d:\d\d$/.test(task.endTime))) errors.times = "Set a start and end time";
  else if (timed && task.startTime === task.endTime) errors.times = "It must end at a different time than it starts";
  if (task.minTeam > 1 && task.count > 0 && task.count < task.minTeam) {
    errors.count = `Needs at least ${task.minTeam} people — it's done as a team`;
  }
  return errors;
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
    <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
      <Field label="Instructions for staff" optional className="sm:col-span-2">
        <Textarea rows={2} value={task.notes} disabled={disabled} onChange={(e) => onChange({ notes: e.target.value })} placeholder="e.g. Rounds of 10, white linen" />
      </Field>
      <Field label="Skill">
        <Select value={task.skillId} disabled={disabled} onChange={(e) => onChange({ skillId: e.target.value, minLevel: e.target.value ? task.minLevel : "" })}>
          <option value="">None</option>
          {active.filter((s) => s.kind === "skill").map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Minimum level" hint={task.minLevel ? "Below this, people can't be picked automatically" : "Experienced people are ranked first"}>
        <Select value={task.minLevel} disabled={disabled || !task.skillId} onChange={(e) => onChange({ minLevel: e.target.value as SkillLevel | "" })}>
          <option value="">Anyone</option>
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>
              {SKILL_LEVEL_LABELS[l]} or above
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-[13px] font-medium text-fg-2">Qualifications required (must be current)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {active.filter((s) => s.kind === "qualification").map((q) => (
            <Checkbox
              key={q.id}
              label={q.name}
              disabled={disabled}
              checked={task.qualificationIds.includes(q.id)}
              onChange={(e) =>
                onChange({
                  qualificationIds: e.target.checked ? [...task.qualificationIds, q.id] : task.qualificationIds.filter((id) => id !== q.id),
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <Field label="Physical demand">
        <Select value={task.demand} disabled={disabled} onChange={(e) => onChange({ demand: e.target.value as Demand })}>
          {DEMANDS.map((d) => (
            <option key={d} value={d}>
              {DEMAND_LABELS[d]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Done as a team of" hint="2 or more for team lifting">
        <Input
          type="number"
          min={1}
          max={10}
          value={task.minTeam}
          disabled={disabled}
          onChange={(e) => {
            const minTeam = Math.max(1, Math.min(10, Math.floor(Number(e.target.value) || 1)));
            onChange({ minTeam, count: Math.max(task.count, minTeam) });
          }}
        />
      </Field>
      <Field
        label="Safety controls or equipment needed"
        optional
        className="sm:col-span-2"
        hint="Generate won't fill this task until the controls are confirmed. Where you can, reduce the load or use equipment rather than relying on manual lifting."
      >
        <Input value={task.controls} disabled={disabled} onChange={(e) => onChange({ controls: e.target.value, controlsConfirmed: false })} placeholder="e.g. Table trolleys; lift staging in pairs" />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        {task.controls && (
          <Checkbox label="The controls are arranged for this event" disabled={disabled} checked={task.controlsConfirmed} onChange={(e) => onChange({ controlsConfirmed: e.target.checked })} />
        )}
        <Checkbox
          label="Mandatory"
          description="Optional tasks are filled after everything else and never count as a gap"
          disabled={disabled}
          checked={task.mandatory}
          onChange={(e) => onChange({ mandatory: e.target.checked })}
        />
        <Checkbox label="A supervisor or team leader must be on the event during it" disabled={disabled} checked={task.needsSupervisor} onChange={(e) => onChange({ needsSupervisor: e.target.checked })} />
        <Checkbox label="This is a supervisor or team leader role" disabled={disabled} checked={task.leadership} onChange={(e) => onChange({ leadership: e.target.checked })} />
        <Checkbox
          label="Its staff may do another combinable task at the same time"
          description={critical ? "Not available for heavy or team work" : undefined}
          disabled={disabled || critical}
          checked={task.combinable && !critical}
          onChange={(e) => onChange({ combinable: e.target.checked })}
        />
      </div>
    </div>
  );
}

// Add, remove and adjust an event's tasks: headcount and times up front,
// requirements under "Requirements".
export default function TaskEditor({
  tasks,
  onChange,
  taskTypes,
  skills,
  templates,
  times,
  peopleOn = {},
  disabled = false,
  showErrors = false,
}: {
  tasks: EventTask[];
  onChange: (tasks: EventTask[]) => void;
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
  times: EventTimes | null; // the event's times, for default task times; null until they're set
  peopleOn?: Record<string, number>; // task id → people rostered (those tasks can't be removed)
  disabled?: boolean;
  showErrors?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const active = taskTypes.filter((t) => t.active);

  const update = (id: string, change: Partial<EventTask>) => onChange(tasks.map((t) => (t.id === id ? { ...t, ...change } : t)));

  // A lone untouched "Event staff" task (with no one on it) is replaced by the first real task.
  const replaceable = (list: EventTask[]) =>
    list.length === 1 && list[0].id === GENERAL_TASK_ID && list[0].typeId === "" && !peopleOn[GENERAL_TASK_ID];

  function addType(id: string) {
    const type = taskTypes.find((t) => t.id === id);
    if (!type || !times) return;
    const base = replaceable(tasks) ? [] : tasks;
    const task = taskFromType(type, 1, phaseWindow(type.phase, times), base, formatMinutes);
    onChange([...base, task]);
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
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          No tasks yet — add the work this event needs below, or start from a template.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const people = peopleOn[task.id] ?? 0;
            const general = task.id === GENERAL_TASK_ID && !task.startTime;
            const errors = showErrors ? taskErrors(task, tasks) : {};
            const badges = requirementBadges(task, skills);
            return (
              <li key={task.id} className={cn("rounded-lg border bg-surface px-3 py-3", Object.keys(errors).length ? "border-danger-line" : "border-line")}>
                <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto_auto_auto] sm:items-start">
                  <div>
                    <Input
                      value={task.name}
                      disabled={disabled}
                      onChange={(e) => update(task.id, { name: e.target.value })}
                      aria-label="Task name"
                      aria-invalid={errors.name ? true : undefined}
                      className="font-medium"
                    />
                    {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
                  </div>
                  <div>
                    <Stepper
                      label={`Workers needed for ${task.name}`}
                      value={task.count}
                      min={task.minTeam > 1 ? task.minTeam : 0}
                      onChange={(count) => update(task.id, { count })}
                      disabled={disabled}
                      unit={["person", "people"]}
                    />
                    {errors.count && <p className="mt-1 text-xs text-danger">{errors.count}</p>}
                  </div>
                  <div>
                    {general ? (
                      <p className="flex h-9 items-center text-[13px] text-muted">Whole shift (setup → pack-down)</p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          aria-label={`${task.name} starts`}
                          value={task.startTime}
                          disabled={disabled}
                          onChange={(e) => update(task.id, { startTime: e.target.value })}
                          aria-invalid={errors.times ? true : undefined}
                          className="w-[7.5rem]"
                        />
                        <span className="text-muted">–</span>
                        <Input
                          type="time"
                          aria-label={`${task.name} ends`}
                          value={task.endTime}
                          disabled={disabled}
                          onChange={(e) => update(task.id, { endTime: e.target.value })}
                          aria-invalid={errors.times ? true : undefined}
                          className="w-[7.5rem]"
                        />
                      </div>
                    )}
                    {errors.times && <p className="mt-1 text-xs text-danger">{errors.times}</p>}
                  </div>
                  <IconButton
                    icon="trash"
                    label={people > 0 ? `Take the ${people} people off ${task.name} first` : `Remove ${task.name}`}
                    disabled={disabled || people > 0}
                    onClick={() => onChange(tasks.filter((t) => t.id !== task.id))}
                    className="justify-self-end"
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {badges.map((b) => (
                    <Badge key={b.text} tone={b.tone}>
                      {b.text}
                    </Badge>
                  ))}
                  {people > 0 && <span className="text-xs text-muted">{people} rostered</span>}
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs"
                    iconRight={open === task.id ? "chevronUp" : "chevronDown"}
                    onClick={() => setOpen(open === task.id ? null : task.id)}
                    aria-expanded={open === task.id}
                  >
                    {badges.length ? "Requirements" : "Add requirements"}
                  </Button>
                </div>
                {open === task.id && <Advanced task={task} skills={skills} disabled={disabled} onChange={(change) => update(task.id, change)} />}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value=""
          disabled={disabled || !times}
          onChange={(e) => e.target.value && addType(e.target.value)}
          aria-label="Add a task"
          className="w-full sm:w-64"
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
        </Select>
        <Button icon="plus" disabled={disabled || !times} onClick={addBlank}>
          Custom task
        </Button>
        {templates.length > 0 && (
          <Select
            value=""
            disabled={disabled || !times}
            onChange={(e) => e.target.value && addTemplate(e.target.value)}
            aria-label="Add the tasks from a template"
            className="w-full sm:w-64"
          >
            <option value="">Add tasks from a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {!times && <p className="mt-1.5 text-xs text-muted">Set the event&apos;s start and finish first.</p>}
    </div>
  );
}
