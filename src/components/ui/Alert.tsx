import type { ReactNode } from "react";
import { type Tone, toneIcon } from "./Badge";
import { Icon } from "./Icon";
import { cn } from "./cn";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-fg-2",
  info: "border-line bg-primary-soft text-fg-2",
  success: "border-success-line bg-success-soft text-fg-2",
  warning: "border-warning-line bg-warning-soft text-fg-2",
  danger: "border-danger-line bg-danger-soft text-fg-2",
};

const iconTone: Record<Tone, string> = {
  neutral: "text-muted",
  info: "text-primary-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

// A message box: what happened and, when there is one, what to do.
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className = "",
  role,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", tones[tone], className)}>
      <Icon name={toneIcon[tone]} size={16} className={cn("mt-0.5", iconTone[tone])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
