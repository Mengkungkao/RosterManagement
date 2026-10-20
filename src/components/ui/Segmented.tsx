"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

// A small set of mutually exclusive options (views, ranges).
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: IconName; title?: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-md border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-[13px]",
            value === o.value ? "bg-surface text-fg shadow-card ring-1 ring-line" : "text-muted hover:text-fg"
          )}
        >
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Underlined tabs for switching sections of a page.
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            value === t.value ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg"
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded bg-surface-3 px-1.5 text-xs text-muted tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
