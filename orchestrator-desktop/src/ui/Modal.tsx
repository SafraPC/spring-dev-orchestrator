import { useEffect } from "react";
import { Icon } from "./Icons";

type ModalProps = {
  open: boolean;
  title: string;
  message: string;
  kind?: "warning" | "danger" | "info";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const KINDS = {
  warning: { icon: "Stop" as const, ring: "ring-warn/20", iconCls: "text-warn bg-warn/10" },
  danger: { icon: "Trash" as const, ring: "ring-danger/20", iconCls: "text-danger bg-danger/10" },
  info: { icon: "Box" as const, ring: "ring-accent/20", iconCls: "text-accent bg-accent/10" },
};

export function Modal(props: ModalProps) {
  const { open, onCancel } = props;

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel]);

  if (!open) return null;
  const k = KINDS[props.kind ?? "info"];
  const Ic = Icon[k.icon];

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 pointer-events-none">
        <div className={`pointer-events-auto w-full max-w-sm animate-scale-in rounded-xl border border-white/[0.08] bg-surface-2 shadow-elevated ring-1 ${k.ring}`}>
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`shrink-0 rounded-lg p-2 ${k.iconCls}`}>
                <Ic className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-100">{props.title}</h3>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed whitespace-pre-line">{props.message}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
            <button className="btn btn-ghost text-xs" onClick={onCancel}>
              {props.cancelLabel ?? "Cancelar"}
            </button>
            <button
              className={`btn text-xs font-semibold ${props.kind === "danger" ? "btn-danger" : "btn-primary"}`}
              onClick={props.onConfirm}
              autoFocus
            >
              {props.confirmLabel ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
