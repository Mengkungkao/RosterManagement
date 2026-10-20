// Shared Tailwind class strings, so buttons and inputs look the same everywhere.

export const card =
  "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

export const primaryButton =
  "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export const secondaryButton =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

export const linkButton =
  "text-sm font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50";

export const input =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export const label = "block text-sm text-zinc-600 dark:text-zinc-400";

export const errorBox =
  "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300";

export const warningText = "text-amber-700 dark:text-amber-400";
export const errorText = "text-red-600 dark:text-red-400";
export const successText = "text-emerald-600 dark:text-emerald-400";
export const mutedText = "text-zinc-500 dark:text-zinc-400";

export function messageClass(type: "success" | "warning" | "error"): string {
  return type === "success" ? successText : type === "warning" ? warningText : errorText;
}
