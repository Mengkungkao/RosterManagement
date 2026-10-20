"use client";

import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import { Dialog } from "./Overlay";
import { cn } from "./cn";

// --- Toasts: short confirmations after the server has saved something --------

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider");
  return api;
}

// --- Confirm: a dialog instead of window.confirm ---------------------------------

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a FeedbackProvider");
  return confirm;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, text: string) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-3), { id, tone, text }]);
      if (tone !== "error") setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );
  const [api] = useState<ToastApi>(() => ({
    success: (text) => push("success", text),
    error: (text) => push("error", text),
    info: (text) => push("info", text),
  }));

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );
  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ToastContext.Provider value={api}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div
          aria-live="polite"
          className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-surface px-3 py-2.5 text-sm text-fg shadow-pop",
                t.tone === "error" ? "border-danger-line" : "border-line"
              )}
            >
              <Icon
                name={t.tone === "success" ? "checkCircle" : t.tone === "error" ? "alertCircle" : "info"}
                size={16}
                className={cn("mt-0.5", t.tone === "success" ? "text-success" : t.tone === "error" ? "text-danger" : "text-primary-text")}
              />
              <p className="min-w-0 flex-1">{t.text}</p>
              <IconButton icon="x" label="Dismiss" size="sm" className="-my-1 -mr-1.5 h-7 w-7" onClick={() => dismiss(t.id)} />
            </div>
          ))}
        </div>
        {pending && (
          <Dialog
            role="alertdialog"
            size="sm"
            title={pending.title}
            onClose={() => answer(false)}
            footer={
              <>
                <Button variant={pending.tone === "danger" ? "danger" : "primary"} onClick={() => answer(true)} data-autofocus>
                  {pending.confirmLabel ?? "Confirm"}
                </Button>
                <Button variant="ghost" onClick={() => answer(false)}>
                  Cancel
                </Button>
              </>
            }
          >
            <div className="text-sm text-fg-2">{pending.description}</div>
          </Dialog>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
