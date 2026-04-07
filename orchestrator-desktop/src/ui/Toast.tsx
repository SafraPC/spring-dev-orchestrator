import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

export type ToastType = "success" | "error" | "info";
export type ToastItem = { id: number; type: ToastType; message: string };

const STYLES: Record<ToastType, { bg: string; icon: keyof typeof Icon; iconCls: string }> = {
  success: { bg: "bg-accent/10 border-accent/20", icon: "Check", iconCls: "text-accent" },
  error: { bg: "bg-danger/10 border-danger/20", icon: "X", iconCls: "text-danger" },
  info: { bg: "bg-surface-3 border-white/[0.08]", icon: "Box", iconCls: "text-slate-400" },
};

export function Toast(props: { toast: ToastItem; onClose: (id: number) => void }) {
  const { toast, onClose } = props;
  const style = STYLES[toast.type];
  const Ic = Icon[style.icon];

  useEffect(() => {
    const t = setTimeout(() => onClose(toast.id), 3500);
    return () => clearTimeout(t);
  }, [toast.id, onClose]);

  return (
    <div
      className={`animate-slide-in-right rounded-lg border px-3 py-2.5 text-xs shadow-elevated backdrop-blur-md ${style.bg}`}
    >
      <div className="flex items-center gap-2">
        <Ic className={`h-3.5 w-3.5 shrink-0 ${style.iconCls}`} />
        <span className="text-slate-200">{toast.message}</span>
        <button
          className="ml-1 rounded p-0.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          onClick={() => onClose(toast.id)}
        >
          <Icon.X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, addToast, removeToast };
}
