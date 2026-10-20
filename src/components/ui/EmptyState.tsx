import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

export function EmptyState({
  icon = "info",
  title,
  children,
  action,
  className = "",
  compact = false,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-6" : "px-6 py-12", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-3 text-muted">
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-3 text-sm font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
