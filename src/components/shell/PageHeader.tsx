import type { ReactNode } from "react";

// The line under the top bar: what this page is for, and its main actions.
export function PageHeader({ description, actions, children }: { description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-72">
        {description && <p className="max-w-3xl text-sm text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-fg-2">
      <p className="font-medium text-fg">Couldn&apos;t load data from Google Sheets</p>
      <p className="mt-0.5">
        {message}. Nothing has been changed. Use the reload button in the top bar to try again; if it keeps failing, check
        the sheet is still shared with the service account.
      </p>
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}
