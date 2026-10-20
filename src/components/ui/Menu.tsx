"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "./cn";

export interface MenuItem {
  label: string;
  icon?: IconName;
  href?: string;
  onSelect?: () => void;
  tone?: "danger";
  disabled?: boolean;
}

// A small dropdown of actions. Arrow keys move, Escape closes.
export function Menu({
  trigger,
  label,
  items,
  header,
  align = "right",
}: {
  trigger: (props: { open: boolean; toggle: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  label: string;
  items: MenuItem[];
  header?: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = (item: MenuItem) =>
    cn(
      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm outline-none",
      item.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-3 focus:bg-surface-3",
      item.tone === "danger" ? "text-danger" : "text-fg-2"
    );

  return (
    <div ref={box} className="relative">
      {trigger({ open, toggle: () => setOpen(!open), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-40 mt-1 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {header && <div className="border-b border-line px-2.5 pt-1.5 pb-2 text-xs text-muted">{header}</div>}
          {items.map((item) =>
            item.href ? (
              <Link key={item.label} href={item.href} role="menuitem" className={itemClass(item)} onClick={() => setOpen(false)}>
                {item.icon && <Icon name={item.icon} size={15} className="text-muted" />}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                aria-disabled={item.disabled || undefined}
                className={itemClass(item)}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.icon && <Icon name={item.icon} size={15} className={item.tone === "danger" ? "" : "text-muted"} />}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
