import { useState, useRef, useCallback } from "react";

export function Tooltip(props: { text: string; delay?: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const ms = props.delay ?? 400;

  const show = useCallback(() => {
    timer.current = setTimeout(() => setVisible(true), ms);
  }, [ms]);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(false);
  }, []);

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {props.children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-[999] whitespace-nowrap animate-fade-in pointer-events-none">
          <span className="block rounded bg-surface-4 px-2 py-1 text-2xs text-slate-200 shadow-elevated border border-white/[0.08]">
            {props.text}
          </span>
        </span>
      )}
    </span>
  );
}
