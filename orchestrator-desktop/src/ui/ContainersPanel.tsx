import { useCallback, useState } from "react";
import { api } from "../api/client";
import type { ContainerDto, ServiceDto } from "../api/types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Tooltip } from "./Tooltip";
import type { ToastType } from "./Toast";
import { useDragReorder } from "./useDragReorder";

export function ContainersPanel(props: {
  services: ServiceDto[];
  containers: ContainerDto[];
  selectedContainer: string | null;
  onSelectContainer: (id: string | null) => void | Promise<void>;
  onRefresh: () => Promise<void>;
  onContainersChanged?: () => void | Promise<void>;
  onContainersReorder?: (c: ContainerDto[]) => void;
  onToast?: (t: ToastType, m: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContainerDto | null>(null);
  const [busyContainers, setBusyContainers] = useState<Record<string, "starting" | "stopping">>({});

  const handleReorder = useCallback((reordered: ContainerDto[]) => {
    props.onContainersReorder?.(reordered);
    void api.reorderContainers(reordered.map((c) => c.id));
  }, [props.onContainersReorder]);

  const { items: containers, containerRef, gripProps, activeId } = useDragReorder(
    props.containers, (c) => c.id, handleReorder
  );

  const svcCount = (id: string) => props.services.filter((s) => s.containerIds?.includes(id)).length;
  const runCount = (id: string) => props.services.filter((s) => s.containerIds?.includes(id) && s.status === "RUNNING").length;

  async function handleCreate() {
    if (!newName.trim()) return;
    await api.createContainer(newName.trim());
    setNewName(""); setShowForm(false);
    await props.onContainersChanged?.();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    try {
      await api.deleteContainer(deleteTarget.id);
      if (props.selectedContainer === deleteTarget.id) props.onSelectContainer(null);
      setDeleteTarget(null);
      await props.onRefresh();
      props.onToast?.("success", `"${name}" excluído`);
    } catch (e) {
      setDeleteTarget(null);
      props.onToast?.("error", String(e));
    }
  }

  function handleStartContainer(c: ContainerDto) {
    setBusyContainers((prev) => ({ ...prev, [c.id]: "starting" }));
    props.onToast?.("info", `Iniciando "${c.name}"...`);
    api.startContainer(c.id)
      .then(() => { props.onToast?.("success", `"${c.name}" iniciado`); return props.onRefresh(); })
      .catch((e) => props.onToast?.("error", String(e)))
      .finally(() => setBusyContainers((prev) => { const n = { ...prev }; delete n[c.id]; return n; }));
  }

  function handleStopContainer(c: ContainerDto) {
    setBusyContainers((prev) => ({ ...prev, [c.id]: "stopping" }));
    props.onToast?.("info", `Parando "${c.name}"...`);
    api.stopContainer(c.id)
      .then(() => { props.onToast?.("success", `"${c.name}" parado`); return props.onRefresh(); })
      .catch((e) => props.onToast?.("error", String(e)))
      .finally(() => setBusyContainers((prev) => { const n = { ...prev }; delete n[c.id]; return n; }));
  }

  async function handleImportIntoContainer(c: ContainerDto) {
    try {
      const picked = await api.selectFolder();
      if (!picked?.trim()) return;
      const paths = picked.trim().split("|").filter(Boolean);
      const before = await api.listServices();
      const beforeNames = new Set(before.map((s) => s.name));
      const result = await api.importRootsAndScan(paths);
      const all = Array.isArray(result) ? result : [];
      const added = all.filter((s) => !beforeNames.has(s.name));
      if (added.length === 0) {
        props.onToast?.("info", "Nenhum serviço novo encontrado.");
        await props.onRefresh();
        return;
      }
      for (const s of added) await api.addServiceToContainer(s.name, c.id);
      props.onToast?.("success", `${added.length} serviço(s) importado(s) em "${c.name}"`);
      await props.onRefresh();
    } catch (e) {
      props.onToast?.("error", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-1 shrink-0">
        <button className="btn btn-ghost w-full justify-start gap-2 text-2xs text-slate-500 hover:text-accent" onClick={() => setShowForm(!showForm)}>
          <Icon.Plus className="h-3 w-3" />
          Novo container
        </button>
        {showForm && (
          <div className="mt-2 animate-slide-up rounded-lg border border-accent/10 bg-surface-2 p-2.5">
            <input type="text" placeholder="Nome do container" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="input text-2xs" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); if (e.key === "Escape") { setShowForm(false); setNewName(""); } }}
            />
            <div className="mt-2 flex gap-1.5">
              <button className="btn btn-primary text-2xs flex-1" onClick={() => void handleCreate()}>Criar</button>
              <button className="btn btn-ghost text-2xs" onClick={() => { setShowForm(false); setNewName(""); }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
        <div ref={containerRef} className="space-y-2">
          {containers.map((c) => {
            const sel = props.selectedContainer === c.id;
            const total = svcCount(c.id);
            const running = runCount(c.id);
            const busy = busyContainers[c.id];
            return (
              <div key={c.id} data-drag-item
                className={`group cursor-pointer rounded-lg px-3 py-2.5 transition-all duration-200 ${sel ? "bg-accent/[0.06] border border-accent/20 shadow-glow" : "border border-white/[0.06] bg-surface-1 hover:bg-surface-2 hover:border-white/[0.10]"} ${activeId === c.id ? "opacity-40 scale-[0.98] shadow-lg shadow-accent/10 border-accent/30" : ""}`}
                onClick={() => void props.onSelectContainer(sel ? null : c.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 cursor-grab active:cursor-grabbing text-slate-600 opacity-40 group-hover:opacity-100 group-hover:text-slate-400 transition-all"
                    {...gripProps(c.id)}>
                    <Icon.Grip className="h-3.5 w-3.5" />
                  </span>
                  <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${busy ? "bg-accent/15" : sel ? "bg-accent/15" : "bg-surface-3"}`}>
                    {busy ? <Spinner /> : <Icon.Box className={`h-3 w-3 ${sel ? "text-accent" : "text-slate-600"}`} />}
                  </div>
                  <span className={`truncate text-xs font-medium flex-1 min-w-0 ${sel ? "text-slate-100" : "text-slate-300"}`}>{c.name}</span>
                  {busy && <span className={`badge shrink-0 text-2xs ${busy === "starting" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>{busy === "starting" ? "Iniciando..." : "Parando..."}</span>}
                  {!busy && running > 0 && <span className="badge bg-accent/10 text-accent shrink-0">{running}/{total}</span>}
                  {!busy && running === 0 && total > 0 && <span className="badge bg-surface-3 text-slate-500 shrink-0">{total}</span>}
                  <div className="ml-auto flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {running === 0 && (
                      <Tooltip text="Iniciar todos">
                        <button className="rounded-md p-1 transition-all duration-100 disabled:opacity-30 text-accent hover:bg-accent/10" disabled={!!busy} onClick={() => handleStartContainer(c)}>
                          <Icon.Play className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    )}
                    {running > 0 && (
                      <Tooltip text="Parar todos">
                        <button className="rounded-md p-1 transition-all duration-100 disabled:opacity-30 text-danger hover:bg-danger/10" disabled={!!busy} onClick={() => handleStopContainer(c)}>
                          <Icon.Stop className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip text="Excluir">
                      <button className="rounded-md p-1 transition-all duration-100 disabled:opacity-30 text-slate-500 hover:bg-white/5 hover:text-danger" disabled={!!busy} onClick={() => setDeleteTarget(c)}>
                        <Icon.Trash className="h-3 w-3" />
                      </button>
                    </Tooltip>
                    <Tooltip text="Importar serviços">
                      <button className="rounded-md p-1 transition-all duration-100 disabled:opacity-30 text-slate-500 hover:bg-white/5 hover:text-accent" disabled={!!busy} onClick={() => void handleImportIntoContainer(c)}>
                        <Icon.FolderImport className="h-3 w-3" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
          {containers.length === 0 && (
            <div className="flex flex-col items-center py-10 text-slate-600 animate-fade-in">
              <Icon.Box className="h-8 w-8 mb-3 text-slate-700" />
              <span className="text-2xs">Sem containers</span>
            </div>
          )}
        </div>
      </div>
      <Modal
        open={!!deleteTarget}
        title="Excluir container"
        message={`Excluir "${deleteTarget?.name}"?\nServiços não serão removidos.`}
        kind="danger"
        confirmLabel="Excluir"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin text-accent" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M8 2a6 6 0 014.9 9.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
