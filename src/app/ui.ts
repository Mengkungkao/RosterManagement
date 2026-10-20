// Shared Tailwind class strings, so buttons and inputs look the same everywhere.

export const card =
  "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900";

export const dangerButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950";

export const linkButton =
  "text-sm font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50";

export const input =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-800";

export const label = "block text-sm text-zinc-600 dark:text-zinc-400";

export const errorBox =
  "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300";

export const warningBox =
  "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";

export const infoBox =
  "rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300";

export const warningText = "text-amber-700 dark:text-amber-400";
export const errorText = "text-red-600 dark:text-red-400";
export const successText = "text-emerald-600 dark:text-emerald-400";
export const mutedText = "text-zinc-500 dark:text-zinc-400";

export const sectionTitle = "text-sm font-semibold text-zinc-800 dark:text-zinc-200";

export const chip =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export const tones = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
} as const;

export function messageClass(type: "success" | "warning" | "error"): string {
  return type === "success" ? successText : type === "warning" ? warningText : errorText;
}
