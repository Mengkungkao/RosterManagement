"use client";

import { useState } from "react";
import type { EventView } from "@/lib/overview";
import { eventWindow } from "@/lib/roster";
import type { SkillDef } from "@/lib/skills";
import type { EventTask, TaskType } from "@/lib/tasks";
import type { EventTemplate } from "@/lib/templates";
import TaskEditor, { taskErrors } from "../events/TaskEditor";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Overlay";
import { useEventSaver } from "./useEventSaver";

// Change an event's tasks, headcounts and times without leaving the roster.
export default function TasksDrawer({
  view,
  taskTypes,
  skills,
  templates,
  busy,
  onSaved,
  onClose,
}: {
  view: EventView;
  taskTypes: TaskType[];
  skills: SkillDef[];
  templates: EventTemplate[];
  busy: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { event } = view;
  const saver = useEventSaver(event, onSaved);
  const [tasks, setTasks] = useState<EventTask[]>(() => (event.tasks.length ? event.tasks : view.statuses.map((s) => s.task)));
  const [tried, setTried] = useState(false);
  const ev = eventWindow(event);
  const peopleOn = Object.fromEntries(view.statuses.map((s) => [s.task.id, s.entries.length]));
  const invalid = tasks.some((t) => Object.keys(taskErrors(t, tasks)).length > 0);

  async function save() {
    setTried(true);
    if (invalid) return;
    if (await saver.saveDetails({ tasks }, `Saved the tasks for ${event.name}.`)) onClose();
  }

  return (
    <Drawer
      title="Edit tasks"
      subtitle={`${event.name} · ${event.startTime}–${event.endTime}`}
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" loading={saver.saving} disabled={busy} onClick={save}>
            Save tasks
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {tried && invalid && <span className="text-sm text-danger">Fix the highlighted tasks first.</span>}
        </>
      }
    >
      {saver.error && (
        <Alert tone="danger" className="mb-4" role="alert">
          {saver.error.text}
        </Alert>
      )}
      <TaskEditor
        tasks={tasks}
        onChange={setTasks}
        taskTypes={taskTypes}
        skills={skills}
        templates={templates}
        times={{ start: ev.start, end: ev.end, setupMinutes: event.setupHours * 60, packDownMinutes: event.packDownHours * 60 }}
        peopleOn={peopleOn}
        disabled={saver.saving}
        showErrors={tried}
      />
    </Drawer>
  );
}
