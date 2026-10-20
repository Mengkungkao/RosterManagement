import type { ReactNode } from "react";
import { errorBox } from "../ui";
import AdminControls from "./AdminControls";
import AdminNav from "./AdminNav";

// Title, sign-out, tabs, and a readable error if the sheet couldn't be loaded.
export default function AdminFrame({
  title,
  description,
  loadError,
  children,
}: {
  title: string;
  description: ReactNode;
  loadError?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 pt-6 pb-10 dark:bg-black sm:pt-8 sm:pb-16">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          </div>
          <AdminControls />
        </div>
        <AdminNav />
        {loadError ? (
          <div className={`mt-6 ${errorBox}`}>
            Couldn&apos;t load data from Google Sheets: {loadError}. Nothing has been changed. Use Refresh to try
            again; if it keeps failing, check the sheet is shared with the service account.
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}
