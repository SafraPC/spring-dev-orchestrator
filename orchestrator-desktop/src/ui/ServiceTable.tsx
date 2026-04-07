import { useState } from "react";
import { api } from "../api/client";
import type { ContainerDto, JdkInfo, ServiceDto } from "../api/types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import type { ToastType } from "./Toast";
import { Tooltip } from "./Tooltip";

function uptime(at: string | null | undefined): string | null {
  if (!at) return null;
  const d = Date.now() - new Date(at).getTime();
  if (d < 0) return null;
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

export function ServiceTable(props: {
  services: ServiceDto[];
  selected: string | null;
  onSelect: (name: string) => void;
  onAction: () => Promise<void>;
  onServicesUpdate?: (s: ServiceDto[]) => void;
  selectedContainer?: string | null;
  containers?: ContainerDto[];
  jdks?: JdkInfo[];
  onToast?: (t: ToastType, m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const containers = props.containers ?? [];
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [rmContTarget, setRmContTarget] = useState<{ svc: string; cid: string; cname: string } | null>(null);

  async function addTo(svc: string, cid: string) {
    setMenuOpen(null);
    try {
      const u = await api.addServiceToContainer(svc, cid);
      props.onServicesUpdate?.(u);
      await props.onAction();
    } catch (e) {
      props.onToast?.("error", String(e));
    }
  }

  async function confirmRemoveService() {
    if (!deleteTarget) return;
    await api.removeService(deleteTarget);
    setDeleteTarget(null);
    await props.onAction();
  }

  async function confirmRmCont() {
    if (!rmContTarget) return;
    try {
      const u = await api.removeServiceFromContainer(rmContTarget.svc, rmContTarget.cid);
      props.onServicesUpdate?.(u);
      await props.onAction();
    } catch (e) {
      props.onToast?.("error", String(e));
    }
    setRmContTarget(null);
  }

  return (
    <div className="px-2 pb-2 space-y-1 select-none">
      {props.services.map((s, idx) => {
        const sel = props.selected === s.name;
        const isBusy = busy === s.name;
        const port = s.env?.SERVER_PORT;
        const ut = s.status === "RUNNING" ? uptime(s.lastStartAt) : null;
        const isRunning = s.status === "RUNNING";
        const isError = s.status === "ERROR";

        return (
          <div
            key={s.name}
            className={`group relative animate-fade-in rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-150 ${sel ? "border-accent/25 bg-accent/[0.04] shadow-glow" : "border-transparent hover:border-white/[0.04] hover:bg-surface-2"}`}
            style={{ animationDelay: `${idx * 30}ms` }}
            onClick={() => props.onSelect(s.name)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                {isRunning && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${isRunning ? "bg-accent" : isError ? "bg-danger" : "bg-slate-600"}`}
                />
              </span>
              <span className={`truncate text-xs font-medium ${sel ? "text-slate-100" : "text-slate-200"}`}>
                {s.name}
              </span>
              {s.javaVersion && (
                <Tooltip text={`Java ${s.javaVersion} (projeto)`}>
                  <span className="shrink-0 rounded bg-surface-3 px-1 py-px text-[9px] font-mono font-semibold text-slate-500 leading-none">
                    J{s.javaVersion}
                  </span>
                </Tooltip>
              )}
              <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isRunning && (
                  <Tooltip text="Iniciar">
                    <ActionBtn
                      icon="Play"
                      cls="text-accent hover:bg-accent/10"
                      disabled={isBusy}
                      onClick={async () => {
                        setBusy(s.name);
                        try {
                          await api.start(s.name);
                          await props.onAction();
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                  </Tooltip>
                )}
                {isRunning && (
                  <>
                    <Tooltip text="Parar">
                      <ActionBtn
                        icon="Stop"
                        cls="text-danger hover:bg-danger/10"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusy(s.name);
                          try {
                            await api.stop(s.name);
                            await props.onAction();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                    </Tooltip>
                    <Tooltip text="Reiniciar">
                      <ActionBtn
                        icon="Restart"
                        cls="text-slate-400 hover:bg-white/5"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusy(s.name);
                          try {
                            await api.restart(s.name);
                            await props.onAction();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                    </Tooltip>
                  </>
                )}
                <div className="relative">
                  <Tooltip text="Menu">
                    <ActionBtn
                      icon="Dots"
                      cls="text-slate-500 hover:bg-white/5"
                      onClick={() => setMenuOpen(menuOpen === s.name ? null : s.name)}
                    />
                  </Tooltip>
                  {menuOpen === s.name && (
                    <ContextMenu
                      s={s}
                      port={port}
                      containers={containers}
                      jdks={props.jdks ?? []}
                      onAdd={addTo}
                      onRemove={(svc, cid) => {
                        const c = containers.find((ct) => ct.id === cid);
                        setMenuOpen(null);
                        setRmContTarget({ svc, cid, cname: c?.name ?? "" });
                      }}
                      onClose={() => setMenuOpen(null)}
                      onDelete={() => {
                        setMenuOpen(null);
                        setDeleteTarget(s.name);
                      }}
                      onSetJava={async (name, ver) => {
                        setMenuOpen(null);
                        try {
                          const u = await api.setServiceJavaVersion(name, ver);
                          props.onServicesUpdate?.(u);
                          props.onToast?.("success", `Java ${ver ?? "padrão"} → ${name}`);
                        } catch (e) {
                          props.onToast?.("error", String(e));
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            {(port || ut || s.pid || (s.containerIds && s.containerIds.length > 0)) && (
              <div className="mt-1.5 ml-4 flex items-center gap-2 flex-wrap">
                {port && (
                  <span
                    className="text-2xs text-accent/70 font-mono cursor-pointer hover:text-accent transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`http://localhost:${port}`, "_blank");
                    }}
                  >
                    PORT:{port}
                  </span>
                )}
                {port && s.pid && <span className="text-2xs text-slate-600 select-none">|</span>}
                {s.pid && <span className="text-2xs text-slate-500 font-mono">PID {s.pid}</span>}
                {ut && <span className="text-2xs text-accent/40 font-mono tabular-nums">{ut}</span>}
                {s.containerIds?.map((cid) => {
                  const c = containers.find((ct) => ct.id === cid);
                  return c ? (
                    <span key={cid} className="badge bg-accent/8 text-accent/70">
                      {c.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {isError && s.lastError && <p className="mt-1 ml-4 text-2xs text-danger/80 truncate">{s.lastError}</p>}
          </div>
        );
      })}
      {props.services.length === 0 && (
        <div className="flex flex-col items-center py-12 animate-fade-in">
          <Icon.Box className="h-10 w-10 mb-3 text-slate-800" />
          <p className="text-xs text-slate-600">Nenhum serviço</p>
          <p className="text-2xs text-slate-700 mt-1">Importe um projeto para começar</p>
        </div>
      )}
      <Modal
        open={!!deleteTarget}
        title="Remover serviço"
        message={`Remover "${deleteTarget}"?\nIsso não deleta o projeto.`}
        kind="danger"
        confirmLabel="Remover"
        onConfirm={() => void confirmRemoveService()}
        onCancel={() => setDeleteTarget(null)}
      />
      <Modal
        open={!!rmContTarget}
        title="Remover do container"
        message={`Remover serviço de "${rmContTarget?.cname}"?`}
        kind="warning"
        confirmLabel="Remover"
        onConfirm={() => void confirmRmCont()}
        onCancel={() => setRmContTarget(null)}
      />
    </div>
  );
}

function ActionBtn(props: {
  icon: keyof typeof Icon;
  cls: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  const Ic = Icon[props.icon];
  return (
    <button
      className={`rounded-md p-1 transition-all duration-100 disabled:opacity-30 ${props.cls}`}
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        void props.onClick();
      }}
    >
      <Ic className="h-3 w-3" />
    </button>
  );
}

function ContextMenu(props: {
  s: ServiceDto; port?: string; containers: ContainerDto[]; jdks: JdkInfo[];
  onAdd: (s: string, c: string) => Promise<void>; onRemove: (s: string, c: string) => void;
  onClose: () => void; onDelete: () => void; onSetJava: (name: string, ver: string | null) => Promise<void>;
}) {
  const { s } = props;
  const uniqueVersions = [...new Set(props.jdks.map((j) => j.majorVersion))];
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={props.onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 w-52 animate-scale-in rounded-lg border border-white/[0.08] bg-surface-2 shadow-elevated backdrop-blur-xl max-h-80 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-1">
          <MenuItem icon="Folder" label="Abrir pasta" onClick={async () => { props.onClose(); await api.openServiceFolder(s.name).catch(() => {}); }} />
          <MenuItem icon="Terminal" label="Abrir terminal" onClick={async () => { props.onClose(); await api.openServiceTerminal(s.name).catch(() => {}); }} />
          <MenuItem icon="Code" label="Abrir no editor" onClick={async () => { props.onClose(); await api.openServiceInEditor(s.name).catch(() => {}); }} />
          {props.port && <MenuItem icon="Globe" label={`localhost:${props.port}`} onClick={() => { props.onClose(); window.open(`http://localhost:${props.port}`, "_blank"); }} />}
          {uniqueVersions.length > 0 && (
            <>
              <div className="divider my-1" />
              <p className="px-2 py-1 text-2xs text-slate-600 font-medium uppercase tracking-wider">Java Version</p>
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
            </>
          )}
          <div className="divider my-1" />
          <MenuItem icon="Trash" label="Remover serviço" cls="text-danger/70 hover:text-danger hover:bg-danger/10" onClick={props.onDelete} />
          {props.containers.length > 0 && (
            <>
              <div className="divider my-1" />
              <p className="px-2 py-1 text-2xs text-slate-600 font-medium uppercase tracking-wider">Containers</p>
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
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MenuItem(props: {
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
