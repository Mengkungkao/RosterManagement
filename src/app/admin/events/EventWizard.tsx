"use client";

import { useMemo, useState } from "react";
import { formatHours, formatWeekdayDate, isValidDate, MINUTES_IN_DAY, toMinutes } from "@/lib/dates";
import type { EventAction, EventRecord } from "@/lib/events";
import { plannedPositions } from "@/lib/overview";
import { eventWindow, formatWindow, taskWindow } from "@/lib/roster";
import type { PaySettings } from "@/lib/settings";
import type { SkillDef } from "@/lib/skills";
import { type EventTask, type EventTimes, type TaskType, generalTask } from "@/lib/tasks";
import { type EventTemplate, makeTemplateId, tasksFromTemplate, templateFromTasks } from "@/lib/templates";
import { estimatePositions } from "@/lib/wages";
import {
  chip,
  errorBox,
  input,
  label,
  linkButton,
  mutedText,
  primaryButton,
  secondaryButton,
  tones,
  warningBox,
} from "../../ui";
import { send } from "../api";
import Modal from "../Modal";
import TaskEditor, { requirementBadges } from "../TaskEditor";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const STEPS = ["Details", "Staffing", "Run of show", "Review"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface WizardForm {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  guests: string;
  notes: string;
  setupHours: number;
  packDownHours: number;
  shareStaff: boolean;
  tasks: EventTask[];
  actions: EventAction[];
}

export function formFromEvent(e: EventRecord | null, copy = false): WizardForm {
  if (!e) {
    return {
      name: "",
      date: "",
      startTime: "",
      endTime: "",
      location: "",
      guests: "",
      notes: "",
      setupHours: 1,
      packDownHours: 1,
      shareStaff: false,
      tasks: [],
      actions: [],
    };
  }
  return {
    name: copy ? `${e.name} (copy)` : e.name,
    date: copy ? "" : e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    location: e.location,
    guests: e.guests ? String(e.guests) : "",
    notes: e.notes,
    setupHours: e.setupHours,
    packDownHours: e.packDownHours,
    shareStaff: e.shareStaff,
    tasks: e.tasks.length ? e.tasks : [generalTask(e.staffNeeded)],
    actions: e.actions,
  };
}

function timesOf(form: WizardForm): EventTimes | null {
  if (!TIME.test(form.startTime) || !TIME.test(form.endTime) || form.startTime === form.endTime) return null;
  const w = eventWindow(form);
  return { start: w.start, end: w.end, setupMinutes: form.setupHours * 60, packDownMinutes: form.packDownHours * 60 };
}

// The form as an event, for working out task windows and estimates.
function asEvent(form: WizardForm): EventRecord {
  return {
    id: "draft",
    name: form.name,
    date: isValidDate(form.date) ? form.date : "2026-01-05",
    startTime: form.startTime,
    endTime: form.endTime,
    location: form.location,
    notes: form.notes,
    actions: form.actions,
    staffNeeded: 0,
    setupHours: form.setupHours,
    packDownHours: form.packDownHours,
    shareStaff: form.shareStaff,
    tasks: form.tasks,
    status: "draft",
    rev: 0,
    staff: [],
  };
}

function detailsError(form: WizardForm): string | null {
  if (!form.name.trim()) return "Give the event a name.";
  if (!isValidDate(form.date)) return "Choose the date.";
  if (!TIME.test(form.startTime) || !TIME.test(form.endTime)) return "Set when the event starts and ends.";
  if (form.startTime === form.endTime) return "The event must end at a different time than it starts.";
  if (form.guests && !/^\d{1,5}$/.test(form.guests)) return "Guests must be a number.";
  return null;
}

function staffingWarnings(form: WizardForm): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  for (const t of form.tasks) {
    if (!t.name.trim()) out.push("Every task needs a name.");
    if (names.has(t.name.trim().toLowerCase())) out.push(`There are two tasks called “${t.name}”.`);
    names.add(t.name.trim().toLowerCase());
    if ((t.startTime || t.endTime) && (!TIME.test(t.startTime) || !TIME.test(t.endTime) || t.startTime === t.endTime)) {
      out.push(`${t.name}: set a start and end time.`);
    }
    if (t.minTeam > 1 && t.count > 0 && t.count < t.minTeam) out.push(`${t.name}: needs at least ${t.minTeam} people (team work).`);
  }
  return [...new Set(out)];
}

function reviewNotes(form: WizardForm): string[] {
  const notes: string[] = [];
  const event = asEvent(form);
  const ev = eventWindow(event);
  const leaders = form.tasks.filter((t) => t.leadership && t.count > 0);
  for (const t of form.tasks) {
    if (t.controls && !t.controlsConfirmed) notes.push(`${t.name}: confirm the safety controls (${t.controls}) before Generate will fill it.`);
    if (t.needsSupervisor && leaders.length === 0) notes.push(`${t.name} needs a supervisor or team leader on the event — add one.`);
    const w = taskWindow(event, t);
    if (w.end - w.start > 14 * 60) notes.push(`${t.name} is ${formatHours((w.end - w.start) / 60)} long — check its times.`);
    if (w.end < ev.start - 6 * 60 || w.start > ev.end + 6 * 60) notes.push(`${t.name} (${formatWindow(w)}) is far from the event's times — check them.`);
  }
  return notes;
}

export default function EventWizard({
  event,
  copyOf,
  taskTypes,
  skills,
  templates,
  settings,
  onSaved,
  onClose,
}: {
  event: EventRecord | null; // editing this one; null = new
  copyOf: EventRecord | null; // new, starting as a copy of this one
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
  settings: PaySettings;
  onSaved: (event: EventRecord, created: boolean) => void;
  onClose: () => void;
}) {
  const editing = event !== null;
  const [form, setForm] = useState<WizardForm>(() => formFromEvent(event ?? copyOf, copyOf !== null));
  const [step, setStep] = useState(0);
  const [touchedTasks, setTouchedTasks] = useState(editing || copyOf !== null);
  const [moveTasks, setMoveTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

  const times = timesOf(form);
  const update = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const taskProblems = staffingWarnings(form);
  const startMoved = editing && event && form.startTime !== event.startTime && event.tasks.some((t) => t.startTime);
  const delta = editing && event && TIME.test(form.startTime) ? toMinutes(form.startTime) - toMinutes(event.startTime) : 0;

  const estimate = useMemo(() => {
    if (!times || !isValidDate(form.date)) return null;
    return estimatePositions(plannedPositions(asEvent(form)), settings);
  }, [form, times, settings]);
  const positions = form.tasks.reduce((sum, t) => sum + t.count, 0);

  function chooseTemplate(id: string) {
    if (!times) return;
    if (touchedTasks && !window.confirm("Replace the tasks you've set with this template's?")) return;
    if (id === "") {
      update("tasks", [generalTask(Math.max(1, positions || 1))]);
    } else {
      const template = templates.find((t) => t.id === id);
      if (!template) return;
      setForm((f) => ({
        ...f,
        setupHours: template.setupHours,
        packDownHours: template.packDownHours,
        tasks: tasksFromTemplate(template, taskTypes, {
          ...times,
          setupMinutes: template.setupHours * 60,
          packDownMinutes: template.packDownHours * 60,
        }),
      }));
    }
    setTouchedTasks(true);
  }

  async function save(status?: "draft" | "published") {
    const problem = detailsError(form) ?? taskProblems[0] ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      ...form,
      guests: form.guests ? Number(form.guests) : null,
      ...(status ? { status } : {}),
      ...(editing ? { rev: event!.rev, moveTasks: Boolean(startMoved && moveTasks) } : {}),
    };
    const result = await send<{ event: EventRecord }>(
      editing ? `/api/admin/events/${encodeURIComponent(event!.id)}` : "/api/admin/events",
      editing ? "PUT" : "POST",
      body
    );
    setSaving(false);
    if (!result.ok) setError(result.error);
    else onSaved(result.data.event, !editing);
  }

  async function saveTemplate() {
    if (!times || !templateName?.trim()) return;
    const event = asEvent(form);
    const template = templateFromTasks(
      templateName.trim(),
      form.tasks.map((t) => ({ typeId: t.typeId, name: t.name, count: t.count, window: taskWindow(event, t), notes: t.notes })),
      times,
      makeTemplateId(templateName, templates)
    );
    const result = await send("/api/admin/config/templates", "PUT", { templates: [...templates, template] });
    setTemplateMessage(result.ok ? `Saved as template “${template.name}”.` : result.error);
    if (result.ok) setTemplateName(null);
  }

  const next = () => {
    const problem = step === 0 ? detailsError(form) : step === 1 ? taskProblems[0] : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  return (
    <Modal
      title={editing ? `Edit ${event!.name}` : copyOf ? "New event (copy)" : "New event"}
      subtitle={
        <ol className="mt-1 flex flex-wrap gap-1" aria-label="Steps">
          {STEPS.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => {
                  if (i <= step || (!detailsError(form) && (i < 2 || !taskProblems.length))) setStep(i);
                }}
                aria-current={i === step ? "step" : undefined}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  i === step ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                }`}
              >
                {i + 1}. {name}
              </button>
            </li>
          ))}
        </ol>
      }
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className={secondaryButton}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 && (
            <button type="button" onClick={next} className={primaryButton}>
              Next: {STEPS[step + 1]}
            </button>
          )}
          {step === STEPS.length - 1 &&
            (editing ? (
              <button type="button" disabled={saving} onClick={() => save()} className={primaryButton}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <>
                <button type="button" disabled={saving} onClick={() => save("draft")} className={primaryButton}>
                  {saving ? "Saving…" : "Save as draft"}
                </button>
                <button type="button" disabled={saving} onClick={() => save("published")} className={secondaryButton}>
                  Save and publish
                </button>
              </>
            ))}
          {editing && step < STEPS.length - 1 && (
            <button type="button" disabled={saving} onClick={() => save()} className={`${secondaryButton} ml-auto`}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      }
    >
      {error && <div className={`mb-3 ${errorBox}`} role="alert">{error}</div>}

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={label}>Event name</span>
            <input autoFocus value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Smith wedding" className={`mt-1 w-full ${input}`} />
          </label>
          <label>
            <span className={label}>Date</span>
            <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className={`mt-1 w-full ${input}`} />
          </label>
          <label>
            <span className={label}>Venue or room</span>
            <input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Great Room" className={`mt-1 w-full ${input}`} />
          </label>
          <label>
            <span className={label}>Event starts</span>
            <input type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} className={`mt-1 w-full ${input}`} />
          </label>
          <label>
            <span className={label}>Event ends</span>
            <input type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} className={`mt-1 w-full ${input}`} />
            {times && times.end > MINUTES_IN_DAY && <span className={`mt-0.5 block text-xs ${mutedText}`}>Finishes after midnight</span>}
          </label>
          <label>
            <span className={label}>Guests (optional)</span>
            <input inputMode="numeric" value={form.guests} onChange={(e) => update("guests", e.target.value.replace(/\D/g, ""))} className={`mt-1 w-full ${input}`} />
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Notes for staff (optional): uniform, preparation, access</span>
            <textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} className={`mt-1 w-full ${input}`} />
          </label>
          {startMoved && (
            <div className={`sm:col-span-2 ${warningBox}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={moveTasks} onChange={(e) => setMoveTasks(e.target.checked)} />
                <span>
                  Also move every task&apos;s times by {delta > 0 ? "+" : ""}
                  {formatHours(delta / 60)} to match the new start time
                  <span className="block text-xs">Left unticked, task times stay exactly as they are.</span>
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className={label}>Start from</span>
              <select
                value=""
                onChange={(e) => e.target.value !== "keep" && chooseTemplate(e.target.value === "blank" ? "" : e.target.value)}
                className={`mt-1 w-full ${input}`}
              >
                <option value="keep">{touchedTasks ? "Keep the tasks below" : "Choose a template or blank…"}</option>
                <option value="blank">Blank — general staff only</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    Template: {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-28">
              <span className={label}>Setup (h)</span>
              <input type="number" min={0} max={12} step={0.25} value={form.setupHours} onChange={(e) => update("setupHours", Number(e.target.value))} className={`mt-1 w-full ${input}`} />
            </label>
            <label className="w-28">
              <span className={label}>Pack-down (h)</span>
              <input type="number" min={0} max={12} step={0.25} value={form.packDownHours} onChange={(e) => update("packDownHours", Number(e.target.value))} className={`mt-1 w-full ${input}`} />
            </label>
          </div>
          <p className={`mt-1 text-xs ${mutedText}`}>
            Setup and pack-down set the default times of setup and pack-down tasks, and the shift of general staff.
          </p>
          <div className="mt-4">
            <TaskEditor
              tasks={form.tasks}
              onChange={(tasks) => {
                update("tasks", tasks);
                setTouchedTasks(true);
              }}
              taskTypes={taskTypes}
              skills={skills}
              templates={templates}
              times={times}
              peopleOn={event ? Object.fromEntries(event.tasks.map((t) => [t.id, event.staff.filter((s) => (s.taskId || "main") === t.id).length])) : {}}
            />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={form.shareStaff} onChange={(e) => update("shareStaff", e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              Staff can also work other functions at the same time
              <span className={`block text-xs ${mutedText}`}>e.g. a Studio 1 function covered by the Great Room team. Their time is only counted once.</span>
            </span>
          </label>
          {taskProblems.length > 0 && (
            <ul className={`mt-3 ${warningBox}`}>
              {taskProblems.map((p) => (
                <li key={p}>⚠ {p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <p className={`text-sm ${mutedText}`}>Optional milestones staff see on their shift, e.g. entrée service, speeches, bar closes.</p>
          <div className="mt-3 space-y-2">
            {form.actions.map((action, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="time"
                  aria-label="Time"
                  value={action.time}
                  onChange={(e) => update("actions", form.actions.map((a, i) => (i === index ? { ...a, time: e.target.value } : a)))}
                  className={`w-32 ${input}`}
                />
                <input
                  aria-label="What happens"
                  placeholder="e.g. Entrée service"
                  value={action.label}
                  onChange={(e) => update("actions", form.actions.map((a, i) => (i === index ? { ...a, label: e.target.value } : a)))}
                  className={`min-w-0 flex-1 ${input}`}
                />
                <button
                  type="button"
                  onClick={() => update("actions", form.actions.filter((_, i) => i !== index))}
                  className="px-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Remove step"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => update("actions", [...form.actions, { label: "", time: "" }])} className={`${secondaryButton} mt-3`}>
            + Add milestone
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{form.name}</h3>
            <p className={mutedText}>
              {isValidDate(form.date) ? formatWeekdayDate(form.date) : ""} · {form.startTime}–{form.endTime}
              {form.location && ` · ${form.location}`}
              {form.guests && ` · ${form.guests} guests`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className={`border-b border-zinc-200 text-left text-xs dark:border-zinc-800 ${mutedText}`}>
                  <th className="py-2 pr-3 font-medium">Task</th>
                  <th className="py-2 pr-3 text-right font-medium">People</th>
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 font-medium">Requirements</th>
                </tr>
              </thead>
              <tbody>
                {form.tasks.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                    <td className="py-2 pr-3 font-medium">{t.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{t.count}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatWindow(taskWindow(asEvent(form), t))}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {requirementBadges(t, skills).map((b) => (
                          <span key={b.text} className={`${chip} ${tones[b.tone]}`}>
                            {b.text}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <span className="font-medium">{positions} positions</span>
            {estimate && (
              <span className={mutedText}>
                {" "}
                · ≈ {formatHours(estimate.hours)} of work · ≈ {money.format(estimate.pay)} if every position is a Level 1
                casual (award minimum, before super — the real figure depends on who is rostered)
              </span>
            )}
          </p>
          {reviewNotes(form).length > 0 && (
            <ul className={warningBox}>
              {reviewNotes(form).map((n) => (
                <li key={n}>⚠ {n}</li>
              ))}
            </ul>
          )}
          {form.actions.filter((a) => a.label.trim()).length > 0 && (
            <div>
              <h4 className="font-medium">Run of show</h4>
              <ul className={mutedText}>
                {form.actions
                  .filter((a) => a.label.trim())
                  .map((a, i) => (
                    <li key={i}>
                      <span className="tabular-nums">{a.time || form.startTime}</span> {a.label}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-900">
            {templateName === null ? (
              <button type="button" onClick={() => setTemplateName(form.name)} className={linkButton} disabled={!times}>
                Save these tasks as a template for next time
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} aria-label="Template name" className={`min-w-48 flex-1 ${input}`} />
                <button type="button" onClick={saveTemplate} disabled={!templateName.trim()} className={secondaryButton}>
                  Save template
                </button>
                <button type="button" onClick={() => setTemplateName(null)} className={linkButton}>
                  Cancel
                </button>
              </div>
            )}
            {templateMessage && <p className={`mt-1 text-xs ${mutedText}`}>{templateMessage}</p>}
          </div>
          {!editing && (
            <p className={`text-xs ${mutedText}`}>
              A draft isn&apos;t shown to staff. Staff it on the Roster (or with Generate roster), then publish.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
