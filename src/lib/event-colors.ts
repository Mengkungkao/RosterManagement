// Muted hues to tell events apart. Green, amber and red are left out: those
// mean filled, warning and problem everywhere else in the app.
const EVENT_COLORS = [
  "bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
  "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  "bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  "bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800",
  "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700",
  "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:ring-blue-800",
];

// Deterministic per-event color, stable across renders and (since it's keyed
// by event id) consistent between the admin roster grid and any other view
// of the same events, e.g. the staff-facing Today's Events page.
export function colorForEvent(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}
