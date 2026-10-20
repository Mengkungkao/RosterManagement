"use client";

import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";
import { cn } from "./cn";

// True once running in the browser, so overlays opened from a link (e.g.
// ?person=…) render after hydration instead of during server rendering.
const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

// Escape closes, focus moves into the panel and back afterwards, Tab stays
// inside, and the page behind doesn't scroll.
function useOverlay(onClose: () => void, active: boolean) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab" && node) {
        const items = [...node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")].filter(
          (el) => el.offsetParent !== null
        );
        if (items.length === 0) return;
        const [head, tail] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [active]);
  return panel;
}

function Header({ title, subtitle, onClose, actions }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
      </div>
      {actions}
      <IconButton icon="x" label="Close" size="sm" onClick={onClose} className="-mr-1.5" />
    </div>
  );
}

// A centred dialog (a sheet from the bottom on phones).
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
  role = "dialog",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  role?: "dialog" | "alertdialog";
}) {
  const mounted = useMounted();
  const panel = useOverlay(onClose, mounted);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-line bg-surface shadow-pop outline-none sm:rounded-xl",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-4xl" : "sm:max-w-2xl"
        )}
      >
        <Header title={title} subtitle={subtitle} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// A panel from the right edge, for working on one thing without leaving the
// page (full width on phones).
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = "md",
  headerActions,
  nav,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
  headerActions?: ReactNode;
  nav?: ReactNode;
}) {
  const mounted = useMounted();
  const panel = useOverlay(onClose, mounted);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "flex h-full w-full flex-col border-l border-line bg-surface shadow-pop outline-none",
          width === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl"
        )}
      >
        <Header title={title} subtitle={subtitle} onClose={onClose} actions={headerActions} />
        {nav}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
