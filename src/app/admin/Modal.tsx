"use client";

import { type ReactNode, useEffect, useRef } from "react";

// A dialog: a bottom sheet on phones, a centred panel on larger screens.
// Escape or the backdrop closes it.
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl dark:bg-zinc-950 ${
          wide ? "sm:max-w-4xl" : "sm:max-w-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 pt-4 pb-3 dark:border-zinc-900">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-900">{footer}</div>
        )}
      </div>
    </div>
  );
}
