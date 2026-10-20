import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cn("rounded-lg border border-line bg-surface shadow-card", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  actions,
  className = "",
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// A section heading outside a card.
export function SectionTitle({ children, count, actions, id }: { children: ReactNode; count?: number; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-sm font-semibold text-fg">
        {children}
        {count !== undefined && <span className="ml-1.5 font-normal text-muted tabular-nums">{count}</span>}
      </h2>
      {actions}
    </div>
  );
}
