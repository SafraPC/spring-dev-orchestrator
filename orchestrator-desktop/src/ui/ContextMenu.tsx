import { useRef, useState, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../api/client";
import type { ContainerDto, JdkInfo, ServiceDto } from "../api/types";
import { Icon } from "./Icons";

function clampTop(top: number, height: number): number {
  const max = window.innerHeight - height - 8;
  return Math.max(8, Math.min(top, max));
}

export function ContextMenu(props: {
  s: ServiceDto;
  port?: string;
  containers: ContainerDto[];
  jdks: JdkInfo[];
  onAdd: (s: string, c: string) => Promise<void>;
  onRemove: (s: string, c: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onSetJava: (name: string, ver: string | null) => Promise<void>;
}) {
  const { s } = props;
  const uniqueVersions = [...new Set(props.jdks.map((j) => j.majorVersion))];
  const [openSub, setOpenSub] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const adjusted = useRef(false);

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    adjusted.current = false;
    setPos({ top: r.bottom + 4, left: Math.max(0, r.right - 192) });
  }, []);

  useLayoutEffect(() => {
    if (!menuRef.current || !pos || adjusted.current) return;
    const h = menuRef.current.getBoundingClientRect().height;
    const clamped = clampTop(pos.top, h);
    if (clamped !== pos.top) {
      adjusted.current = true;
      setPos((p) => p ? { ...p, top: clamped } : p);
    }
  }, [pos]);

  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenSub(null), 150);
  }, []);

  const cancelClose = useCallback((key: string) => {
    clearTimeout(closeTimer.current);
    setOpenSub(key);
  }, []);

  const menu = (
    <>
      <div className="fixed inset-0 z-[200]" onClick={props.onClose} />
      <div
        ref={menuRef}
        className="fixed z-[201] w-48 animate-scale-in rounded-lg border border-white/[0.08] bg-surface-2 shadow-elevated backdrop-blur-xl"
        style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" as const }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-1">
          <MenuItem icon="Folder" label="Abrir pasta" onClick={async () => { props.onClose(); await api.openServiceFolder(s.name).catch(() => {}); }} />
          <MenuItem icon="Terminal" label="Abrir terminal" onClick={async () => { props.onClose(); await api.openServiceTerminal(s.name).catch(() => {}); }} />
          <MenuItem icon="Code" label="Abrir no editor" onClick={async () => { props.onClose(); await api.openServiceInEditor(s.name).catch(() => {}); }} />
          {props.port && <MenuItem icon="Globe" label={`localhost:${props.port}`} onClick={async () => { props.onClose(); await openUrl(`http://localhost:${props.port}`).catch(() => {}); }} />}

          {uniqueVersions.length > 0 && (!s.projectType || s.projectType === "SPRING_BOOT") && (
            <>
              <div className="divider my-1" />
              <SubMenu label="Java Version" icon="Code" isOpen={openSub === "java"}
                menuRef={menuRef} onEnter={() => cancelClose("java")} onLeave={scheduleClose}>
                {uniqueVersions.map((v) => {
                  const isActive = s.javaVersion === v;
                  const jdk = props.jdks.find((j) => j.majorVersion === v);
                  return (
                    <button key={v} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${isActive ? "bg-accent/10 text-accent" : "text-slate-400 hover:bg-surface-3 hover:text-slate-200"}`}
                      onClick={() => void props.onSetJava(s.name, v)}>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-2xs">J{v}</span>
                        <span className="text-2xs text-slate-600 truncate">{jdk?.vendor}</span>
                      </span>
                      {isActive && <Icon.Check className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })}
                <button className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${!s.javaVersion ? "bg-accent/10 text-accent" : "text-slate-400 hover:bg-surface-3 hover:text-slate-200"}`}
                  onClick={() => void props.onSetJava(s.name, null)}>
                  <span className="text-2xs">Padrão (JAVA_HOME)</span>
                  {!s.javaVersion && <Icon.Check className="h-3 w-3 shrink-0" />}
                </button>
              </SubMenu>
            </>
          )}

          {props.containers.length > 0 && (
            <>
              <div className="divider my-1" />
              <SubMenu label="Containers" icon="Box" isOpen={openSub === "containers"}
                menuRef={menuRef} onEnter={() => cancelClose("containers")} onLeave={scheduleClose}>
                {props.containers.map((c) => {
                  const inC = s.containerIds?.includes(c.id);
                  return (
                    <button key={c.id} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${inC ? "bg-accent/10 text-accent" : "text-slate-400 hover:bg-surface-3 hover:text-slate-200"}`}
                      onClick={(e) => { e.stopPropagation(); if (inC) { props.onRemove(s.name, c.id); } else { void props.onAdd(s.name, c.id); } }}>
                      <span className="truncate mr-2">{c.name}</span>
                      {inC && <Icon.Check className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })}
              </SubMenu>
            </>
          )}

          <div className="divider my-1" />
          <MenuItem icon="Trash" label="Remover serviço" cls="text-danger/70 hover:text-danger hover:bg-danger/10" onClick={props.onDelete} />
        </div>
      </div>
    </>
  );

  return (
    <>
      <div ref={anchorRef} className="absolute right-0 top-full" />
      {createPortal(menu, document.body)}
    </>
  );
}

function SubMenu(props: {
  label: string;
  icon: keyof typeof Icon;
  isOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onEnter: () => void;
  onLeave: () => void;
  children: React.ReactNode;
}) {
  const Ic = Icon[props.icon];
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);
  const adjusted = useRef(false);

  const recalc = useCallback(() => {
    if (!triggerRef.current) return;
    adjusted.current = false;
    const r = triggerRef.current.getBoundingClientRect();
    const menuRect = props.menuRef.current?.getBoundingClientRect();
    const menuRight = menuRect ? menuRect.right : r.right;
    const menuLeft = menuRect ? menuRect.left : r.left;
    const left = menuRight + 4;
    const fitsRight = left + 192 <= window.innerWidth;
    setSubPos({
      top: r.top,
      left: fitsRight ? left : menuLeft - 196,
    });
  }, [props.menuRef]);

  useLayoutEffect(() => {
    if (!props.isOpen || !panelRef.current || !subPos || adjusted.current) return;
    const h = panelRef.current.getBoundingClientRect().height;
    const clamped = clampTop(subPos.top, h);
    if (clamped !== subPos.top) {
      adjusted.current = true;
      setSubPos((prev) => prev ? { ...prev, top: clamped } : prev);
    }
  }, [props.isOpen, subPos]);

  return (
    <div ref={triggerRef} onMouseEnter={() => { props.onEnter(); recalc(); }} onMouseLeave={props.onLeave}>
      <button className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${props.isOpen ? "bg-surface-3 text-slate-200" : "text-slate-400 hover:text-slate-200 hover:bg-surface-3"}`}>
        <Ic className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate flex-1 text-left">{props.label}</span>
        <Icon.Chevron className="h-3 w-3 shrink-0 rotate-180" />
      </button>
      {props.isOpen && subPos && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[202] w-48 animate-scale-in rounded-lg border border-white/[0.08] bg-surface-2 shadow-elevated backdrop-blur-xl max-h-60 overflow-y-auto"
          style={{ top: subPos.top, left: subPos.left }}
          onMouseEnter={props.onEnter}
          onMouseLeave={props.onLeave}
        >
          <div className="p-1">{props.children}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function MenuItem(props: {
  icon: keyof typeof Icon;
  label: string;
  cls?: string;
  onClick: () => void | Promise<void>;
}) {
  const Ic = Icon[props.icon];
  return (
    <button
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${props.cls ?? "text-slate-400 hover:text-slate-200 hover:bg-surface-3"}`}
      onClick={() => void props.onClick()}
    >
      <Ic className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{props.label}</span>
    </button>
  );
}
