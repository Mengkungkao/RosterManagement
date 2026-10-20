"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MINUTES_IN_DAY, formatHours, formatWeekdayDate, fortnightStartFor, isValidDate, toMinutes } from "@/lib/dates";
import type { EventAction, EventRecord } from "@/lib/events";
import { plannedPositions } from "@/lib/overview";
import { eventWindow, formatWindow, taskWindow } from "@/lib/roster";
import type { PaySettings } from "@/lib/settings";
import type { SkillDef } from "@/lib/skills";
import { type EventTask, type EventTimes, type TaskType, generalTask } from "@/lib/tasks";
import { type EventTemplate, makeTemplateId, tasksFromTemplate, templateFromTasks } from "@/lib/templates";
import { estimatePositions } from "@/lib/wages";
import { send } from "../admin/api";
import { money } from "../roster/model";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button, ButtonLink, IconButton } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { Checkbox, Field, Input, Select, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { useConfirm, useToast } from "../ui/feedback";
import TaskEditor, { requirementBadges, taskErrors } from "./TaskEditor";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Form {
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

type FieldKey = "name" | "date" | "startTime" | "endTime" | "guests" | "setupHours" | "packDownHours";

function formFrom(e: EventRecord | null, copy: boolean): Form {
  if (!e) {
    return { name: "", date: "", startTime: "", endTime: "", location: "", guests: "", notes: "", setupHours: 1, packDownHours: 1, shareStaff: false, tasks: [], actions: [] };
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

function timesOf(form: Form): EventTimes | null {
  if (!TIME.test(form.startTime) || !TIME.test(form.endTime) || form.startTime === form.endTime) return null;
  const w = eventWindow(form);
  return { start: w.start, end: w.end, setupMinutes: form.setupHours * 60, packDownMinutes: form.packDownHours * 60 };
}

function asEvent(form: Form): EventRecord {
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

function fieldErrors(form: Form): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (!form.name.trim()) e.name = "Give the event a name";
  if (!isValidDate(form.date)) e.date = "Choose the date";
  if (!TIME.test(form.startTime)) e.startTime = "Set when it starts";
  if (!TIME.test(form.endTime)) e.endTime = "Set when it finishes";
  else if (form.startTime === form.endTime) e.endTime = "It must finish at a different time than it starts";
  if (form.guests && !/^\d{1,5}$/.test(form.guests)) e.guests = "Enter a number of guests";
  for (const key of ["setupHours", "packDownHours"] as const) {
    if (!Number.isFinite(form[key]) || form[key] < 0 || form[key] > 12) e[key] = "Between 0 and 12 hours";
  }
  return e;
}

function reviewNotes(form: Form): string[] {
  const notes: string[] = [];
  const event = asEvent(form);
  const ev = eventWindow(event);
  const leaders = form.tasks.filter((t) => t.leadership && t.count > 0);
  if (form.tasks.length === 0) notes.push("Add at least one task, or the event needs no staff.");
  for (const t of form.tasks) {
    if (t.controls && !t.controlsConfirmed) notes.push(`${t.name}: confirm the safety controls (${t.controls}) before Generate will fill it.`);
    if (t.needsSupervisor && leaders.length === 0) notes.push(`${t.name} needs a supervisor or team leader on the event — add one.`);
    if (!t.startTime) continue;
    const w = taskWindow(event, t);
    if (w.end - w.start > 14 * 60) notes.push(`${t.name} is ${formatHours((w.end - w.start) / 60)} long — check its times.`);
    if (w.end < ev.start - 6 * 60 || w.start > ev.end + 6 * 60) notes.push(`${t.name} (${formatWindow(w)}) is far from the event's times — check them.`);
  }
  return notes;
}

// Create or edit an event on one page: details, the work it needs, and the
// run of show, with a live summary and estimate alongside.
export default function EventForm({
  event,
  copyOf,
  taskTypes,
  skills,
  templates,
  settings,
  returnTo,
}: {
  event: EventRecord | null; // editing this one; null = new
  copyOf: EventRecord | null; // new, starting as a copy of this one
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
  settings: PaySettings;
  returnTo: "events" | "roster";
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = event !== null;
  const initial = useMemo(() => formFrom(event ?? copyOf, copyOf !== null), [event, copyOf]);
  const [form, setForm] = useState<Form>(initial);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [tried, setTried] = useState(false);
  const [moveTasks, setMoveTasks] = useState(false);
  const [saving, setSaving] = useState<"draft" | "published" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const saved = useRef(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const times = timesOf(form);
  const errors = fieldErrors(form);
  const show = (key: FieldKey) => (tried || touched.has(key) ? errors[key] : undefined);
  const touch = (key: FieldKey) => setTouched((t) => new Set(t).add(key));
  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const taskProblems = form.tasks.filter((t) => Object.keys(taskErrors(t, form.tasks)).length > 0);
  const startMoved = editing && form.startTime !== event!.startTime && event!.tasks.some((t) => t.startTime);
  const delta = editing && TIME.test(form.startTime) ? toMinutes(form.startTime) - toMinutes(event!.startTime) : 0;
  const positions = form.tasks.reduce((sum, t) => sum + t.count, 0);
  const estimate = useMemo(() => (times && isValidDate(form.date) ? estimatePositions(plannedPositions(asEvent(form)), settings) : null), [form, times, settings]);
  const notes = reviewNotes(form);

  // Keep what's been typed if the page is closed by accident.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !saved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function chooseTemplate(id: string) {
    if (!times) return;
    const hasTasks = form.tasks.some((t) => t.typeId || t.count !== 1 || t.startTime);
    if (hasTasks && !(await confirm({ title: "Replace the tasks?", description: "The tasks you've set will be replaced by the template's.", confirmLabel: "Replace tasks" }))) return;
    if (id === "blank") {
      update("tasks", [generalTask(Math.max(1, positions || 1))]);
      return;
    }
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setForm((f) => ({
      ...f,
      setupHours: template.setupHours,
      packDownHours: template.packDownHours,
      tasks: tasksFromTemplate(template, taskTypes, { ...times, setupMinutes: template.setupHours * 60, packDownMinutes: template.packDownHours * 60 }),
    }));
    toast.info(`Added the tasks from “${template.name}”. Adjust the numbers and times to this event.`);
  }

  async function save(status?: "draft" | "published") {
    setTried(true);
    if (Object.keys(errors).length > 0 || taskProblems.length > 0) {
      setError(null);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setSaving(status ?? "save");
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
    setSaving(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    saved.current = true;
    const e = result.data.event;
    toast.success(
      !editing
        ? `Saved “${e.name}”${e.status === "draft" ? " as a draft. Staff it on the roster, then publish." : " and published it."}`
        : `Saved changes to “${e.name}”.`
    );
    if (returnTo === "events" && editing) router.push("/admin/events");
    else router.push(`/admin/roster?fortnight=${fortnightStartFor(e.date, settings.fortnightStart)}&event=${encodeURIComponent(e.id)}`);
    router.refresh();
  }

  async function saveTemplate() {
    if (!times || !templateName?.trim()) return;
    setSavingTemplate(true);
    const ev = asEvent(form);
    const template = templateFromTasks(
      templateName.trim(),
      form.tasks.map((t) => ({ typeId: t.typeId, name: t.name, count: t.count, window: taskWindow(ev, t), notes: t.notes })),
      times,
      makeTemplateId(templateName, templates)
    );
    const result = await send("/api/admin/config/templates", "PUT", { templates: [...templates, template] });
    setSavingTemplate(false);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(`Saved the template “${template.name}”.`);
      setTemplateName(null);
    }
  }

  const cancelHref = returnTo === "events" || !editing ? "/admin/events" : `/admin/roster?fortnight=${fortnightStartFor(event!.date, settings.fortnightStart)}&event=${encodeURIComponent(event!.id)}`;

  const actions = editing ? (
    <>
      <Button variant="primary" icon="check" loading={saving === "save"} disabled={saving !== null} onClick={() => save()}>
        Save changes
      </Button>
      {event!.status === "draft" && (
        <Button icon="send" loading={saving === "published"} disabled={saving !== null} onClick={() => save("published")}>
          Save and publish
        </Button>
      )}
    </>
  ) : (
    <>
      <Button variant="primary" loading={saving === "draft"} disabled={saving !== null} onClick={() => save("draft")}>
        Save as draft
      </Button>
      <Button icon="send" loading={saving === "published"} disabled={saving !== null} onClick={() => save("published")}>
        Save and publish
      </Button>
    </>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        {tried && (Object.keys(errors).length > 0 || taskProblems.length > 0) && (
          <Alert tone="danger" role="alert">
            {Object.keys(errors).length + taskProblems.length} detail{Object.keys(errors).length + taskProblems.length === 1 ? " needs" : "s need"} fixing — highlighted below. Nothing has been saved yet.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" role="alert">
            {error} Your changes are still here.
          </Alert>
        )}

        <Card>
          <CardHeader title="1. Event details" description="What it is, where and when." />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Event name" error={show("name")} className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} onBlur={() => touch("name")} placeholder="e.g. Smith wedding" autoFocus={!editing} />
            </Field>
            <Field label="Date" error={show("date")} hint={isValidDate(form.date) ? formatWeekdayDate(form.date) : undefined}>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} onBlur={() => touch("date")} />
            </Field>
            <Field label="Venue or room" optional>
              <Input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Great Room" />
            </Field>
            <Field label="Event starts" error={show("startTime")}>
              <Input type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} onBlur={() => touch("startTime")} />
            </Field>
            <Field label="Event finishes" error={show("endTime")} hint={times && times.end > MINUTES_IN_DAY ? "Finishes after midnight" : undefined}>
              <Input type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} onBlur={() => touch("endTime")} />
            </Field>
            <Field label="Guests" optional error={show("guests")}>
              <Input inputMode="numeric" value={form.guests} onChange={(e) => update("guests", e.target.value.replace(/\D/g, ""))} onBlur={() => touch("guests")} />
            </Field>
            <Field label="Notes for staff" optional hint="Uniform, preparation, access — staff see this on their shift." className="sm:col-span-2">
              <Textarea rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </Field>
            {startMoved && (
              <div className="sm:col-span-2">
                <Alert tone="warning" title="The start time changed">
                  <Checkbox
                    className="mt-1"
                    checked={moveTasks}
                    onChange={(e) => setMoveTasks(e.target.checked)}
                    label={`Also move every task's times by ${delta > 0 ? "+" : ""}${formatHours(delta / 60)}`}
                    description="Left unticked, task times stay exactly as they are."
                  />
                </Alert>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="2. Staffing requirements" description="The work this event needs: tasks, how many people, when, and what they need." />
          <div className="p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
              <Field label="Start from a template" hint={times ? undefined : "Set the event's times first."}>
                <Select value="" disabled={!times} onChange={(e) => e.target.value && chooseTemplate(e.target.value)}>
                  <option value="">Choose a template…</option>
                  <option value="blank">Blank — general staff only</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Setup (hours)" error={show("setupHours")}>
                <Input type="number" min={0} max={12} step={0.25} value={form.setupHours} onChange={(e) => update("setupHours", Number(e.target.value))} onBlur={() => touch("setupHours")} />
              </Field>
              <Field label="Pack-down (hours)" error={show("packDownHours")}>
                <Input type="number" min={0} max={12} step={0.25} value={form.packDownHours} onChange={(e) => update("packDownHours", Number(e.target.value))} onBlur={() => touch("packDownHours")} />
              </Field>
            </div>
            <p className="mt-1.5 text-xs text-muted">Setup and pack-down set the default times of setup and pack-down tasks, and the shift of general staff.</p>
            <div className="mt-4">
              <TaskEditor
                tasks={form.tasks}
                onChange={(tasks) => update("tasks", tasks)}
                taskTypes={taskTypes}
                skills={skills}
                templates={templates}
                times={times}
                showErrors={tried}
                peopleOn={event ? Object.fromEntries((event.tasks.length ? event.tasks : [generalTask(0)]).map((t) => [t.id, event.staff.filter((s) => (s.taskId || "main") === t.id).length])) : {}}
              />
            </div>
            <Checkbox
              className="mt-4"
              checked={form.shareStaff}
              onChange={(e) => update("shareStaff", e.target.checked)}
              label="Staff can also work other functions at the same time"
              description="e.g. a Studio 1 function covered by the Great Room team. Their time is only counted once."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="3. Schedule and review" description="Run-of-show milestones staff see on their shift, and a check before saving." />
          <div className="p-4">
            <h3 className="text-[13px] font-medium text-fg-2">Run of show</h3>
            {form.actions.length === 0 && <p className="mt-1 text-sm text-muted">No milestones yet — e.g. entrée service, speeches, bar closes.</p>}
            <ol className="mt-2 space-y-2">
              {form.actions.map((action, index) => (
                <li key={index} className="flex gap-2">
                  <Input
                    type="time"
                    aria-label={`Milestone ${index + 1} time`}
                    value={action.time}
                    onChange={(e) => update("actions", form.actions.map((a, i) => (i === index ? { ...a, time: e.target.value } : a)))}
                    className="w-32"
                  />
                  <Input
                    aria-label={`Milestone ${index + 1}`}
                    placeholder="e.g. Entrée service"
                    value={action.label}
                    onChange={(e) => update("actions", form.actions.map((a, i) => (i === index ? { ...a, label: e.target.value } : a)))}
                    className="min-w-0 flex-1"
                  />
                  <IconButton icon="trash" label={`Remove milestone ${index + 1}`} onClick={() => update("actions", form.actions.filter((_, i) => i !== index))} />
                </li>
              ))}
            </ol>
            <Button size="sm" icon="plus" className="mt-2" onClick={() => update("actions", [...form.actions, { label: "", time: "" }])}>
              Add milestone
            </Button>

            <h3 className="mt-6 text-[13px] font-medium text-fg-2">Staffing summary</h3>
            {form.tasks.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No tasks yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Task</th>
                      <th className="px-3 py-2 text-right font-medium">People</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Requirements</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {form.tasks.map((t) => (
                      <tr key={t.id} className="align-top">
                        <td className="px-3 py-2 font-medium text-fg">{t.name || <span className="text-danger">Unnamed</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.count}</td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{times ? formatWindow(taskWindow(asEvent(form), t)) : "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {requirementBadges(t, skills).map((b) => (
                              <Badge key={b.text} tone={b.tone}>
                                {b.text}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4">
              {templateName === null ? (
                <Button size="sm" variant="ghost" icon="copy" disabled={!times || form.tasks.length === 0} onClick={() => setTemplateName(form.name)}>
                  Save these tasks as a template
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} aria-label="Template name" className="min-w-48 flex-1" />
                  <Button size="sm" loading={savingTemplate} disabled={!templateName.trim()} onClick={saveTemplate}>
                    Save template
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTemplateName(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <aside className="xl:sticky xl:top-20">
        <Card>
          <CardHeader title="Summary" />
          <dl className="space-y-3 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">When</dt>
              <dd className="text-right font-medium text-fg tabular-nums">
                {isValidDate(form.date) ? formatWeekdayDate(form.date) : "—"}
                {times && ` · ${form.startTime}–${form.endTime}`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Tasks</dt>
              <dd className="font-medium text-fg tabular-nums">{form.tasks.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Positions</dt>
              <dd className="font-medium text-fg tabular-nums">{positions}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Est. hours</dt>
              <dd className="font-medium text-fg tabular-nums">{estimate ? formatHours(estimate.hours) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Est. cost</dt>
              <dd className="font-medium text-fg tabular-nums">{estimate ? `≈ ${money.format(estimate.pay)}` : "—"}</dd>
            </div>
            <p className="text-xs text-muted">Every position as a Level 1 casual at award minimums, before super. The real figure depends on who is rostered.</p>
          </dl>
          {notes.length > 0 && (
            <ul className="space-y-1.5 border-t border-line p-4 text-[13px] text-fg-2">
              {notes.map((n) => (
                <li key={n} className="flex items-start gap-1.5">
                  <Icon name="alert" size={13} className="mt-0.5 text-warning" />
                  {n}
                </li>
              ))}
            </ul>
          )}
          <div className="hidden flex-col gap-2 border-t border-line p-4 xl:flex">
            {actions}
            <ButtonLink href={cancelHref} variant="ghost">
              Cancel
            </ButtonLink>
            {!editing && <p className="text-xs text-muted">Drafts aren&apos;t shown to staff. Publish when the roster is ready.</p>}
          </div>
        </Card>
      </aside>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8 xl:hidden">
        {actions}
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        {dirty && <span className="ml-auto text-xs text-muted">Unsaved changes</span>}
      </div>
    </div>
  );
}
