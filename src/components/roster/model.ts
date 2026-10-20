// Small view helpers shared by the roster components. No sheet access.

import type { EventView } from "@/lib/overview";
import { type TaskStatus, sameName } from "@/lib/roster";
import { type TaskGroup, type TaskType, TASK_GROUP_LABELS } from "@/lib/tasks";

export type GroupKey = TaskGroup | "general" | "other";

export const GROUP_LABELS: Record<GroupKey, string> = {
  ...TASK_GROUP_LABELS,
  general: "General staff",
  other: "Other tasks",
};

export const GROUP_ORDER: GroupKey[] = ["setup", "service", "leadership", "other", "general"];

export function groupOf(status: TaskStatus, taskTypes: TaskType[]): GroupKey {
  if (!status.task.typeId) return status.task.id === "main" ? "general" : "other";
  return taskTypes.find((t) => t.id === status.task.typeId)?.group ?? "other";
}

export interface Filters {
  search: string;
  eventId: string;
  staffName: string;
  group: GroupKey | "";
  days: string[]; // dates in range
}

// The tasks of an event that pass the department and staff filters.
export function visibleTasks(v: EventView, f: Filters, taskTypes: TaskType[]): TaskStatus[] {
  return v.statuses.filter(
    (s) =>
      (!f.group || groupOf(s, taskTypes) === f.group) &&
      (!f.staffName || s.entries.some((c) => sameName(c.entry.name, f.staffName)))
  );
}

export function matchesFilters(v: EventView, f: Filters, taskTypes: TaskType[]): boolean {
  if (!f.days.includes(v.event.date)) return false;
  if (f.eventId && v.event.id !== f.eventId) return false;
  if ((f.group || f.staffName) && visibleTasks(v, f, taskTypes).length === 0) return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return (
    v.event.name.toLowerCase().includes(q) ||
    v.event.location.toLowerCase().includes(q) ||
    v.statuses.some((s) => s.task.name.toLowerCase().includes(q)) ||
    v.event.staff.some((e) => e.name.toLowerCase().includes(q))
  );
}

export const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
