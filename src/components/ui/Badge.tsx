import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-2 border-line",
  success: "bg-success-soft text-success border-success-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  danger: "bg-danger-soft text-danger border-danger-line",
  info: "bg-primary-soft text-primary-text border-transparent",
};

export const toneIcon: Record<Tone, IconName> = {
  neutral: "info",
  success: "checkCircle",
  warning: "alert",
  danger: "xCircle",
  info: "info",
};

// A small label. Status badges carry an icon as well as colour.
export function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
  title,
}: {
  tone?: Tone;
  icon?: IconName | false;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap tabular-nums",
        toneClass[tone],
        className
      )}
    >
      {icon && <Icon name={icon} size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

// "3/4": positions filled of those needed, with words for screen readers.
export function CoverageBadge({
  filled,
  needed,
  unsafe = false,
  suffix = "",
}: {
  filled: number;
  needed: number;
  unsafe?: boolean;
  suffix?: string;
}) {
  const [tone, icon, words]: [Tone, IconName, string] =
    needed === 0
      ? ["neutral", "minus", "none needed"]
      : unsafe
        ? ["danger", "shield", "unsafe"]
        : filled >= needed
          ? ["success", "checkCircle", "filled"]
          : filled > 0
            ? ["warning", "alertCircle", "short"]
            : ["danger", "xCircle", "open"];
  return (
    <Badge tone={tone} icon={icon} title={`${filled} of ${needed} filled — ${words}`}>
      {filled}/{needed}
      {suffix && ` ${suffix}`}
      <span className="sr-only"> — {words}</span>
    </Badge>
  );
}
