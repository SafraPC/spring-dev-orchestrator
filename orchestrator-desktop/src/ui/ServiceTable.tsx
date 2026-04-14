import { useCallback, useState } from "react";
import { api } from "../api/client";
import type { ContainerDto, JdkInfo, ProjectType, ServiceDto } from "../api/types";
import { ContextMenu } from "./ContextMenu";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import type { ToastType } from "./Toast";
import { Tooltip } from "./Tooltip";
import { useDragReorder } from "./useDragReorder";

const TECH_BADGE: Record<string, { icon: keyof typeof Icon; color: string; label: string }> = {
  SPRING_BOOT: { icon: "Java", color: "text-orange-400", label: "Java" },
  NEXT: { icon: "Next", color: "text-white", label: "Next" },
  NEST: { icon: "Nest", color: "text-red-400", label: "Nest" },
  REACT: { icon: "ReactIcon", color: "text-cyan-400", label: "React" },
  VUE: { icon: "Vue", color: "text-emerald-400", label: "Vue" },
};

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
  allServices?: ServiceDto[];
  selected: string | null;
  onSelect: (name: string) => void;
  onAction: () => Promise<void>;
  onServicesUpdate?: (s: ServiceDto[]) => void;
  selectedContainer?: string | null;
  containers?: ContainerDto[];
  jdks?: JdkInfo[];
  onToast?: (t: ToastType, m: string) => void;
  loading?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const containers = props.containers ?? [];
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [rmContTarget, setRmContTarget] = useState<{ svc: string; cid: string; cname: string } | null>(null);

  const allSvcs = props.allServices ?? props.services;
  const handleReorder = useCallback(
    (reordered: ServiceDto[]) => {
      props.onServicesUpdate?.(reordered);
      const subNames = new Set(reordered.map((s) => s.name));
      const otherNames = allSvcs.filter((s) => !subNames.has(s.name)).map((s) => s.name);
      const merged: string[] = [];
      let oIdx = 0,
        sIdx = 0;
      for (const s of allSvcs) {
        if (subNames.has(s.name)) {
          if (sIdx < reordered.length) merged.push(reordered[sIdx++].name);
        } else {
          if (oIdx < otherNames.length) merged.push(otherNames[oIdx++]);
        }
      }
      void api.reorderServices(merged);
    },
    [props.onServicesUpdate, allSvcs],
  );

  const {
    items: orderedServices,
    containerRef,
    gripProps,
    activeId,
  } = useDragReorder(props.services, (s) => s.name, handleReorder);

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
    const name = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.removeService(name);
      await props.onAction();
      props.onToast?.("success", `"${name}" removido`);
    } catch (e) {
      props.onToast?.("error", String(e));
    }
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

  if (props.loading) {
    return (
      <div className="px-2 pb-2 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-white/[0.04] bg-surface-1 px-3 py-3 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded bg-surface-3" />
              <div className="h-2 w-2 rounded-full bg-surface-3" />
              <div className="h-3 rounded bg-surface-3" style={{ width: `${60 + i * 15}px` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-2 pb-2 space-y-2 select-none">
      {orderedServices.map((s) => (
        <ServiceRow key={s.name} s={s} sel={props.selected === s.name} busy={busy}
          containers={containers} jdks={props.jdks ?? []} menuOpen={menuOpen === s.name}
          isDragging={activeId === s.name} gripProps={gripProps(s.name)}
          onSelect={() => props.onSelect(s.name)}
          onMenuToggle={() => setMenuOpen(menuOpen === s.name ? null : s.name)}
          onMenuClose={() => setMenuOpen(null)}
          onDelete={() => { setMenuOpen(null); setDeleteTarget(s.name); }}
          onAdd={addTo}
          onRemove={(svc, cid) => { const c = containers.find((ct) => ct.id === cid); setMenuOpen(null); setRmContTarget({ svc, cid, cname: c?.name ?? "" }); }}
          onSetJava={async (name, ver) => { setMenuOpen(null); try { const u = await api.setServiceJavaVersion(name, ver); props.onServicesUpdate?.(u); props.onToast?.("success", `Java ${ver ?? "padrão"} → ${name}`); } catch (e) { props.onToast?.("error", String(e)); } }}
          onStart={async () => { setBusy(s.name); try { await api.start(s.name); await props.onAction(); } finally { setBusy(null); } }}
          onStop={async () => { setBusy(s.name); try { await api.stop(s.name); await props.onAction(); } finally { setBusy(null); } }}
          onRestart={async () => { setBusy(s.name); try { await api.restart(s.name); await props.onAction(); } finally { setBusy(null); } }}
        />
      ))}
      {props.services.length === 0 && (
        <div className="flex flex-col items-center py-12 animate-fade-in">
          <Icon.Box className="h-10 w-10 mb-3 text-slate-800" />
          <p className="text-xs text-slate-600">Nenhum serviço</p>
          <p className="text-2xs text-slate-700 mt-1">Importe um projeto para começar</p>
        </div>
      )}
      <Modal open={!!deleteTarget} title="Remover serviço" message={`Remover "${deleteTarget}"?\nIsso não deleta o projeto.`}
        kind="danger" confirmLabel="Remover" onConfirm={() => void confirmRemoveService()} onCancel={() => setDeleteTarget(null)} />
      <Modal open={!!rmContTarget} title="Remover do container" message={`Remover serviço de "${rmContTarget?.cname}"?`}
        kind="warning" confirmLabel="Remover" onConfirm={() => void confirmRmCont()} onCancel={() => setRmContTarget(null)} />
    </div>
  );
}

function ServiceRow(props: {
  s: ServiceDto; sel: boolean; busy: string | null;
  containers: ContainerDto[]; jdks: JdkInfo[]; menuOpen: boolean;
  isDragging: boolean; gripProps: { onMouseDown: (e: React.MouseEvent) => void };
  onSelect: () => void; onMenuToggle: () => void; onMenuClose: () => void;
  onDelete: () => void; onAdd: (s: string, c: string) => Promise<void>;
  onRemove: (s: string, c: string) => void;
  onSetJava: (name: string, ver: string | null) => Promise<void>;
  onStart: () => Promise<void>; onStop: () => Promise<void>; onRestart: () => Promise<void>;
}) {
  const { s, sel, containers } = props;
  const isBusy = props.busy === s.name;
  const port = s.env?.SERVER_PORT;
  const ut = s.status === "RUNNING" ? uptime(s.lastStartAt) : null;
  const isRunning = s.status === "RUNNING";
  const isError = s.status === "ERROR";

  return (
    <div
      data-drag-item
      className={`group relative rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200 ${sel ? "border-accent/25 bg-accent/[0.06] shadow-glow" : "border-white/[0.06] bg-surface-1 hover:border-white/[0.10] hover:bg-surface-2"} ${props.isDragging ? "opacity-40 scale-[0.98] shadow-lg shadow-accent/10 border-accent/30 bg-accent/[0.06]" : ""}`}
      onClick={props.onSelect}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="shrink-0 cursor-grab active:cursor-grabbing text-slate-600 opacity-40 group-hover:opacity-100 group-hover:text-slate-400 transition-all"
          {...props.gripProps}
        >
          <Icon.Grip className="h-3.5 w-3.5" />
        </span>
        <span className="relative flex h-2 w-2 shrink-0">
          {isRunning && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${isRunning ? "bg-accent" : isError ? "bg-danger" : "bg-slate-600"}`}
          />
        </span>
        <span className={`truncate text-xs font-medium ${sel ? "text-slate-100" : "text-slate-200"}`}>{s.name}</span>
        <TechBadge projectType={s.projectType} javaVersion={s.javaVersion} />
        <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isRunning && <Tooltip text="Iniciar"><ActionBtn icon="Play" cls="text-accent hover:bg-accent/10" disabled={isBusy} onClick={props.onStart} /></Tooltip>}
          {isRunning && (
            <>
              <Tooltip text="Parar"><ActionBtn icon="Stop" cls="text-danger hover:bg-danger/10" disabled={isBusy} onClick={props.onStop} /></Tooltip>
              <Tooltip text="Reiniciar"><ActionBtn icon="Restart" cls="text-slate-400 hover:bg-white/5" disabled={isBusy} onClick={props.onRestart} /></Tooltip>
            </>
          )}
          <div className="relative">
            <Tooltip text="Menu"><ActionBtn icon="Dots" cls="text-slate-500 hover:bg-white/5" onClick={props.onMenuToggle} /></Tooltip>
            {props.menuOpen && (
              <ContextMenu s={s} port={port} containers={containers} jdks={props.jdks}
                onAdd={props.onAdd} onRemove={props.onRemove} onClose={props.onMenuClose}
                onDelete={props.onDelete} onSetJava={props.onSetJava} />
            )}
          </div>
        </div>
      </div>
      {(port || ut || s.pid || (s.containerIds && s.containerIds.length > 0)) && (
        <div className="mt-1.5 ml-4 flex items-center gap-2 flex-wrap">
          {port && <span className="text-2xs text-accent/70 font-mono cursor-pointer hover:text-accent transition-colors"
            onClick={(e) => { e.stopPropagation(); window.open(`http://localhost:${port}`, "_blank"); }}>PORT:{port}</span>}
          {port && s.pid && <span className="text-2xs text-slate-600 select-none">|</span>}
          {s.pid && <span className="text-2xs text-slate-500 font-mono">PID {s.pid}</span>}
          {ut && <span className="text-2xs text-accent/40 font-mono tabular-nums">{ut}</span>}
          {s.containerIds?.map((cid) => {
            const c = containers.find((ct) => ct.id === cid);
            return c ? <span key={cid} className="badge bg-accent/8 text-accent/70">{c.name}</span> : null;
          })}
        </div>
      )}
      {isError && s.lastError && <p className="mt-1 ml-4 text-2xs text-danger/80 truncate">{s.lastError}</p>}
    </div>
  );
}

function ActionBtn(props: { icon: keyof typeof Icon; cls: string; disabled?: boolean; onClick: () => void | Promise<void> }) {
  const Ic = Icon[props.icon];
  return (
    <button className={`rounded-md p-1 transition-all duration-100 disabled:opacity-30 ${props.cls}`} disabled={props.disabled}
      onClick={(e) => { e.stopPropagation(); void props.onClick(); }}>
      <Ic className="h-3 w-3" />
    </button>
  );
}

function TechBadge(props: { projectType?: ProjectType; javaVersion?: string | null }) {
  const type = props.projectType ?? "SPRING_BOOT";
  const badge = TECH_BADGE[type];
  if (!badge) return null;
  const Ic = Icon[badge.icon];
  const label = type === "SPRING_BOOT" && props.javaVersion ? `J${props.javaVersion}` : badge.label;
  return (
    <Tooltip text={badge.label}>
      <span className={`shrink-0 inline-flex items-center gap-0.5 rounded bg-surface-3 px-1 py-px text-[9px] font-mono font-semibold leading-none ${badge.color}`}>
        <Ic className="h-3.5 w-3.5" />
        {label}
      </span>
    </Tooltip>
  );
}
