import { useState } from "react";
import { api } from "../api/client";
import type { ContainerDto, ServiceDto } from "../api/types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { Tooltip } from "./Tooltip";

export function ContainersPanel(props: {
  services: ServiceDto[];
  containers: ContainerDto[];
  selectedContainer: string | null;
  onSelectContainer: (id: string | null) => void | Promise<void>;
  onRefresh: () => Promise<void>;
  onContainersChanged?: () => void | Promise<void>;
}) {
  const containers = props.containers;
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContainerDto | null>(null);

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
    await api.deleteContainer(deleteTarget.id);
    if (props.selectedContainer === deleteTarget.id) props.onSelectContainer(null);
    setDeleteTarget(null);
    await props.onRefresh();
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
        <div className="space-y-1">
          {containers.map((c) => {
            const sel = props.selectedContainer === c.id;
            const total = svcCount(c.id);
            const running = runCount(c.id);
            return (
              <div key={c.id}
                className={`group animate-fade-in cursor-pointer rounded-lg px-3 py-2.5 transition-all duration-150 ${sel ? "bg-accent/8 border border-accent/20 shadow-glow" : "border border-transparent hover:bg-surface-2 hover:border-white/[0.04]"}`}
                onClick={() => void props.onSelectContainer(sel ? null : c.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${sel ? "bg-accent/15" : "bg-surface-3"}`}>
                    <Icon.Box className={`h-3 w-3 ${sel ? "text-accent" : "text-slate-600"}`} />
                  </div>
                  <span className={`truncate text-xs font-medium flex-1 min-w-0 ${sel ? "text-slate-100" : "text-slate-300"}`}>{c.name}</span>
                  {running > 0 && <span className="badge bg-accent/10 text-accent shrink-0">{running}/{total}</span>}
                  {running === 0 && total > 0 && <span className="badge bg-surface-3 text-slate-500 shrink-0">{total}</span>}
                </div>
                <div className="hidden group-hover:flex items-center gap-0.5 mt-1.5 ml-8" onClick={(e) => e.stopPropagation()}>
                  <Tooltip text="Iniciar todos">
                    <button className="btn-ghost rounded p-1" onClick={() => { void api.startContainer(c.id).then(() => props.onRefresh()); }}>
                      <Icon.Play className="h-2.5 w-2.5 text-accent" />
                    </button>
                  </Tooltip>
                  <Tooltip text="Parar todos">
                    <button className="btn-ghost rounded p-1" onClick={() => { void api.stopContainer(c.id).then(() => props.onRefresh()); }}>
                      <Icon.Stop className="h-2.5 w-2.5 text-danger" />
                    </button>
                  </Tooltip>
                  <Tooltip text="Excluir container">
                    <button className="btn-ghost rounded p-1" onClick={() => setDeleteTarget(c)}>
                      <Icon.Trash className="h-2.5 w-2.5 text-slate-500 hover:text-danger" />
                    </button>
                  </Tooltip>
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
