"use client";

import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  cloneElement,
  isValidElement,
  useId,
} from "react";
import { Icon } from "./Icon";
import { cn } from "./cn";

export const controlClass =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 text-base text-fg shadow-card outline-none transition-colors placeholder:text-subtle focus:border-primary focus:ring-3 focus:ring-ring disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted sm:text-sm aria-[invalid=true]:border-danger";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, "h-9", className)} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className.includes("w-") ? "" : "w-full", className)}>
      <select className={cn(controlClass, "h-9 appearance-none pr-8")} {...rest}>
        {children}
      </select>
      <Icon name="chevronDown" size={15} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "py-2", className)} {...rest} />;
}

// A labelled form control with an optional hint and an error shown under it.
// The control (one child) gets the id, aria-describedby and aria-invalid.
export function Field({
  label,
  hint,
  error,
  children,
  className = "",
  optional = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-fg-2">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </label>
      {control}
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1 text-xs text-danger">
          <Icon name="alertCircle" size={12} />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className = "",
  ...rest
}: { label: ReactNode; description?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={cn("flex items-start gap-2.5 text-sm text-fg-2", rest.disabled && "opacity-60", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)]" {...rest} />
      <span>
        {label}
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Icon name="search" size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(controlClass, "h-9 pl-8", value && "pr-8")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

// − 3 + for small whole numbers.
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  label,
  disabled = false,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  disabled?: boolean;
  unit?: [string, string];
}) {
  const button =
    "flex h-9 w-8 items-center justify-center text-fg-2 hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 items-center overflow-hidden rounded-md border border-line-strong bg-surface shadow-card">
      <button type="button" className={button} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer: ${label}`}>
        <Icon name="minus" size={14} />
      </button>
      <span className="min-w-12 border-x border-line px-2 text-center text-sm tabular-nums" aria-live="polite">
        <span className="font-semibold text-fg">{value}</span>
        {unit && <span className="ml-1 text-muted">{value === 1 ? unit[0] : unit[1]}</span>}
      </span>
      <button type="button" className={button} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`More: ${label}`}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
