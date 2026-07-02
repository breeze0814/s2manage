"use client";

import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastMessage = Required<Pick<ToastInput, "title" | "variant">> &
  Pick<ToastInput, "description"> & {
    id: string;
  };

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  success: "border-teal-400/[0.24] bg-teal-400/[0.12] text-teal-800 dark:text-teal-100",
  error: "border-red-400/[0.28] bg-red-400/[0.13] text-red-700 dark:text-red-200",
  info: "border-primary/[0.24] bg-primary/[0.12] text-foreground dark:text-teal-50",
};

const iconStyles: Record<ToastVariant, string> = {
  success: "text-teal-600 dark:text-teal-300",
  error: "text-red-600 dark:text-red-300",
  info: "text-teal-600 dark:text-teal-300",
};

const variantIcons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description, variant = "info", durationMs = 3500 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((current) => [{ id, title, description, variant }, ...current].slice(0, 4));
      window.setTimeout(() => dismissToast(id), durationMs);
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="fixed left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-[100] flex flex-col gap-2 sm:left-auto sm:w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((toast) => {
          const Icon = variantIcons[toast.variant];
          return (
            <div
              key={toast.id}
              role={toast.variant === "error" ? "alert" : "status"}
              aria-live={toast.variant === "error" ? "assertive" : "polite"}
              data-motion="toast"
              className={cn("rounded-xl border p-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.28),0_18px_58px_hsl(217_34%_35%/0.18)] backdrop-blur-2xl dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08),0_20px_70px_hsl(0_0%_0%/0.45)]", variantStyles[toast.variant])}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 size-5 shrink-0", iconStyles[toast.variant])} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{toast.title}</p>
                  {toast.description ? <p className="mt-1 break-words text-xs opacity-85">{toast.description}</p> : null}
                </div>
                <button
                  type="button"
                  className="-m-2 flex min-h-11 min-w-11 items-center justify-center rounded-md opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="关闭提示"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
