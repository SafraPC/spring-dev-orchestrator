import { confirm } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ContainerDto, ServiceDto } from "../api/types";

function statusBadge(status: ServiceDto["status"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "RUNNING") return `${base} bg-emerald-900/60 text-emerald-200`;
  if (status === "ERROR") return `${base} bg-rose-900/60 text-rose-200`;
  return `${base} bg-slate-800 text-slate-200`;
}

function getLastThreeFolders(path: string): string {
  const parts = path.split("/").filter((p) => p.length > 0);
  if (parts.length <= 3) return path;
  return "..." + parts.slice(-3).join("/");
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
      />
    </svg>
  );
}

export function ServiceTable(props: {
  services: ServiceDto[];
  selected: string | null;
  onSelect: (name: string) => void;
  onAction: () => Promise<void>;
  onServicesUpdate?: (services: ServiceDto[]) => void;
  selectedContainer?: string | null;
  containersRefreshKey?: number;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [containers, setContainers] = useState<ContainerDto[]>([]);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  useEffect(() => {
    const loadContainers = async () => {
      try {
        const list = await api.listContainers();
        setContainers(list);
      } catch (error) {
        console.error("[ServiceTable] Erro ao carregar containers:", error);
      }
    };
    void loadContainers();
  }, [props.containersRefreshKey]);

  useEffect(() => {
    if (showActionMenu) {
      const loadContainers = async () => {
        try {
          const list = await api.listContainers();
          setContainers(list);
        } catch (error) {
          console.error("[ServiceTable] Erro ao recarregar containers:", error);
        }
      };
      void loadContainers();
    }
  }, [showActionMenu]);

  async function handleAddToContainer(serviceName: string, containerId: string) {
    setShowActionMenu(null);
    try {
      const updatedServices = await api.addServiceToContainer(serviceName, containerId);
      if (props.onServicesUpdate) {
        props.onServicesUpdate(updatedServices);
      }
      await props.onAction();
    } catch (error) {
      console.error("[ServiceTable] Erro ao adicionar serviço ao container:", error);
      alert(`Erro ao adicionar serviço ao container: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleRemoveFromContainer(serviceName: string, containerId: string) {
    setShowActionMenu(null);
    try {
      const updatedServices = await api.removeServiceFromContainer(serviceName, containerId);
      if (props.onServicesUpdate) {
        props.onServicesUpdate(updatedServices);
      }
      await props.onAction();
    } catch (error) {
      console.error("Erro ao remover serviço do container:", error);
      alert(`Erro ao remover serviço do container: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <div className="p-2">
      <div className="grid grid-cols-1 gap-2">
        {props.services.map((s) => {
          const isSelected = props.selected === s.name;
          const isBusy = busy === s.name;
          return (
            <button
              key={s.name}
              className={[
                "relative w-full rounded-md border px-4 py-3 text-left transition",
                isSelected ? "border-sky-600 bg-sky-950/30" : "border-slate-800 bg-slate-950/20 hover:bg-slate-950/40",
                showActionMenu === s.name ? "z-50" : "z-0",
              ].join(" ")}
              onClick={() => props.onSelect(s.name)}
            >
              <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5">
                {s.status === "RUNNING" && (
                  <button
                    className="rounded-md bg-slate-700/50 p-1 hover:bg-slate-600/50 disabled:opacity-50"
                    disabled={isBusy}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setBusy(s.name);
                      try {
                        await api.restart(s.name);
                        await props.onAction();
                      } finally {
                        setBusy(null);
                      }
                    }}
                    title="Reiniciar serviço"
                  >
                    <RestartIcon />
                  </button>
                )}
                <div className="relative">
                  <button
                    className="rounded-md bg-slate-700/50 p-1 hover:bg-slate-600/50 disabled:opacity-50"
                    disabled={isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActionMenu(showActionMenu === s.name ? null : s.name);
                    }}
                    title="Mais opções"
                  >
                    <MenuIcon />
                  </button>
                  {showActionMenu === s.name && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          if (e.target === e.currentTarget) {
                            setShowActionMenu(null);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                      <div
                        className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-slate-700 bg-slate-900 shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <div className="p-1">
                          <button
                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center gap-2"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setShowActionMenu(null);
                              try {
                                await api.openServiceFolder(s.name);
                              } catch (error) {
                                console.error("Erro ao abrir pasta:", error);
                              }
                            }}
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                              />
                            </svg>
                            Abrir pasta
                          </button>
                          <button
                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center gap-2"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setShowActionMenu(null);
                              try {
                                await api.openServiceTerminal(s.name);
                              } catch (error) {
                                console.error("Erro ao abrir terminal:", error);
                              }
                            }}
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                              />
                            </svg>
                            Abrir terminal
                          </button>
                          <button
                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center gap-2"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setShowActionMenu(null);
                              try {
                                await api.openServiceInEditor(s.name);
                              } catch (error) {
                                console.error("Erro ao abrir editor:", error);
                              }
                            }}
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                              />
                            </svg>
                            Abrir code
                          </button>
                          <div className="border-t border-slate-700 my-1"></div>
                          <div className="px-2 py-1 text-[10px] font-medium text-slate-400 uppercase">Containers</div>
                          {containers.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-slate-400">Nenhum container criado</div>
                          ) : (
                            <>
                              {(() => {
                                const linkedContainers = containers.filter((c) => s.containerIds?.includes(c.id));
                                const availableContainers = containers.filter((c) => !s.containerIds?.includes(c.id));

                                return (
                                  <>
                                    {linkedContainers.length > 0 && (
                                      <>
                                        <div className="px-2 py-1 text-[10px] font-medium text-emerald-400/70 uppercase">
                                          Linkados
                                        </div>
                                        {linkedContainers.map((container) => (
                                          <button
                                            key={container.id}
                                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center justify-between bg-emerald-900/20"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              setShowActionMenu(null);
                                              await new Promise((resolve) => setTimeout(resolve, 100));
                                              try {
                                                const confirmed = await confirm(
                                                  `Remover o serviço "${s.name}" do container "${container.name}"?`,
                                                  {
                                                    title: "Remover do container",
                                                    kind: "warning",
                                                    okLabel: "Remover",
                                                    cancelLabel: "Cancelar",
                                                  }
                                                );
                                                if (confirmed) {
                                                  await handleRemoveFromContainer(s.name, container.id);
                                                }
                                              } catch (error) {
                                                console.error("Erro ao exibir modal de confirmação:", error);
                                                if (
                                                  window.confirm(
                                                    `Remover o serviço "${s.name}" do container "${container.name}"?`
                                                  )
                                                ) {
                                                  await handleRemoveFromContainer(s.name, container.id);
                                                }
                                              }
                                            }}
                                          >
                                            <span className="flex items-center gap-2">
                                              <FolderIcon />
                                              {container.name}
                                            </span>
                                            <span className="text-emerald-400">✓</span>
                                          </button>
                                        ))}
                                      </>
                                    )}
                                    {availableContainers.length > 0 && (
                                      <>
                                        {linkedContainers.length > 0 && (
                                          <div className="border-t border-slate-700 my-1"></div>
                                        )}
                                        <div className="px-2 py-1 text-[10px] font-medium text-slate-400 uppercase">
                                          Disponíveis
                                        </div>
                                        {availableContainers.map((container) => (
                                          <button
                                            key={container.id}
                                            type="button"
                                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center gap-2"
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                            }}
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              e.preventDefault();
                                              await handleAddToContainer(s.name, container.id);
                                            }}
                                          >
                                            <FolderIcon />
                                            {container.name}
                                          </button>
                                        ))}
                                      </>
                                    )}
                                  </>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 pr-14">
                <div className="min-w-0 flex-1 overflow-hidden space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="truncate font-medium text-sm">{s.name}</div>
                    <span className={statusBadge(s.status)}>{s.status}</span>
                    {s.pid ? <span className="text-xs text-slate-400 shrink-0">PID {s.pid}</span> : null}
                    {s.env?.SERVER_PORT ? (
                      <span className="text-xs text-slate-400 shrink-0">Porta {s.env.SERVER_PORT}</span>
                    ) : null}
                  </div>

                  {s.containerIds && s.containerIds.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s.containerIds.map((cid) => {
                        const container = containers.find((c) => c.id === cid);
                        return container ? (
                          <span
                            key={cid}
                            className="inline-flex items-center gap-1 rounded-full bg-sky-900/40 px-2 py-0.5 text-[10px] text-sky-200"
                          >
                            <FolderIcon />
                            {container.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}

                  <div className="text-xs text-slate-400 truncate" title={s.path}>
                    {getLastThreeFolders(s.path)}
                  </div>

                  {s.lastError ? (
                    <div className="text-xs text-rose-200 truncate" title={s.lastError}>
                      Erro: {s.lastError}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  {s.status !== "RUNNING" && (
                    <button
                      className="rounded-md bg-emerald-700 p-1.5 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                      disabled={isBusy}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setBusy(s.name);
                        try {
                          await api.start(s.name);
                          await props.onAction();
                        } finally {
                          setBusy(null);
                        }
                      }}
                      title="Iniciar serviço"
                    >
                      <PlayIcon />
                    </button>
                  )}

                  {s.status === "RUNNING" && (
                    <button
                      className="rounded-md bg-rose-700 p-1.5 hover:bg-rose-600 disabled:opacity-50 transition-colors"
                      disabled={isBusy}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setBusy(s.name);
                        try {
                          await api.stop(s.name);
                          await props.onAction();
                        } finally {
                          setBusy(null);
                        }
                      }}
                      title="Parar serviço"
                    >
                      <StopIcon />
                    </button>
                  )}

                  <button
                    className="rounded-md bg-rose-800 p-1.5 hover:bg-rose-700 disabled:opacity-50 transition-colors"
                    disabled={isBusy}
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (isBusy) return;

                      try {
                        let confirmed = false;
                        try {
                          confirmed = await confirm(
                            `Tem certeza que deseja remover o serviço "${s.name}" do orquestrador?\n\nIsso não deleta o projeto, apenas remove do gerenciador.`,
                            {
                              title: "Confirmar remoção",
                              kind: "warning",
                              okLabel: "Remover",
                              cancelLabel: "Cancelar",
                            }
                          );
                        } catch (confirmError) {
                          console.error("Erro ao exibir modal de confirmação:", confirmError);
                          confirmed = window.confirm(
                            `Tem certeza que deseja remover o serviço "${s.name}" do orquestrador?\n\nIsso não deleta o projeto, apenas remove do gerenciador.`
                          );
                        }

                        if (!confirmed) {
                          return;
                        }

                        setBusy(s.name);
                        await api.removeService(s.name);
                        await props.onAction();
                      } catch (error) {
                        console.error("Erro ao remover serviço:", error);
                        alert(`Erro ao remover serviço: ${error instanceof Error ? error.message : String(error)}`);
                      } finally {
                        setBusy(null);
                      }
                    }}
                    title="Remover serviço do orquestrador (não deleta o projeto)"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </button>
          );
        })}

        {props.services.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-950/20 p-4 text-sm text-slate-300">
            Nenhum serviço encontrado. Use <span className="text-slate-100">Buscar projetos</span> para adicionar uma
            pasta raiz.
          </div>
        ) : null}
      </div>
    </div>
  );
}
