"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle, X, ExternalLink } from "lucide-react";
import { EXPLORER_TX } from "./config";

type ToastType = "pending" | "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  hash?: string;
}

interface ToastApi {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++counter;
      setToasts((ts) => [...ts, { ...t, id }]);
      if (t.type !== "pending") setTimeout(() => dismiss(id), 6000);
      return id;
    },
    [dismiss]
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.type && patch.type !== "pending") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border bg-[var(--card)] p-3.5 shadow-card-lg"
            >
              <Icon type={t.type} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--text)]">{t.title}</div>
                {t.message && <div className="mt-0.5 text-xs text-[var(--text-dim)]">{t.message}</div>}
                {t.hash && (
                  <a
                    href={EXPLORER_TX(t.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:opacity-80"
                  >
                    View transaction <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {/* Pending toasts never auto-dismiss (the transaction might still land), but a
                  stalled or silently-cancelled wallet flow left them stuck on screen forever
                  with no way to close them — always offer a manual dismiss. */}
              <button onClick={() => dismiss(t.id)} className="text-[var(--text-faint)] hover:text-[var(--text)]">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function Icon({ type }: { type: ToastType }) {
  if (type === "pending") return <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" />;
  if (type === "success") return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" />;
  if (type === "error") return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />;
  return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
