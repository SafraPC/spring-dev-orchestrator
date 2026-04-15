import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { ContainerDto, JdkInfo, ProjectType, RuntimeSettingsDto, ServiceDto } from "../api/types";
import { ContainersPanel } from "./ContainersPanel";
import { Icon } from "./Icons";
import { ImportSection } from "./ImportSection";
import { LogsPanel } from "./LogsPanel";
import { ServiceTable } from "./ServiceTable";
import { SettingsPanel, useSettings } from "./SettingsPanel";
import { StatusBar } from "./StatusBar";
import { Toast, useToast } from "./Toast";
import { Tooltip } from "./Tooltip";

type CoreEvent = { event: string; payload: unknown };

const TECH_LABELS: Record<string, string> = {
  SPRING_BOOT: "Spring",
  NEXT: "Next",
  NEST: "Nest",
  REACT: "React",
  VUE: "Vue",
  UNKNOWN: "Outro",
};

function isJavaStartupError(message: string) {
  return /java/i.test(message);
}

export function App() {
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [techFilter, setTechFilter] = useState<ProjectType | "">("");
  const [containersCollapsed, setContainersCollapsed] = useState(false);
  const [containers, setContainers] = useState<ContainerDto[]>([]);
  const [jdks, setJdks] = useState<JdkInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsDto>({});
  const [javaError, setJavaError] = useState<string | null>(null);
  const [savingJavaPath, setSavingJavaPath] = useState(false);
  const [sideW, setSideW] = useState(288);
  const [svcW, setSvcW] = useState(288);
  const { toasts, addToast, removeToast } = useToast();
  const { settings, setSettings } = useSettings();
  const workspaceRefreshT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(true);
  const selectedService = useMemo(() => services.find((s) => s.name === selected) ?? null, [services, selected]);

  const refreshJdks = useCallback(async () => {
    try {
      setJdks(await api.listJdks());
    } catch {}
  }, []);

  const loadRuntimeSettings = useCallback(async () => {
    try {
      setRuntimeSettings(await api.getRuntimeSettings());
    } catch {}
  }, []);

  const refreshData = useCallback(async () => {
    const BOOTSTRAP_MS = 90_000;
    try {
      const packed = await Promise.race([
        Promise.all([api.listServices(), api.listContainers()]),
        new Promise<never>((_, rej) => {
          setTimeout(
            () => rej(new Error(`Timeout de ${BOOTSTRAP_MS / 1000}s ao falar com o core.`)),
            BOOTSTRAP_MS,
          );
        }),
      ]);
      const [list, ctrs] = packed as [ServiceDto[], ContainerDto[]];
      setServices(list);
      setContainers(ctrs);
      setSelected((prev) => (prev && !list.some((s) => s.name === prev) ? null : prev));
      setJavaError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast("error", message);
      if (isJavaStartupError(message)) {
        setJavaError(message);
        setSettingsOpen(true);
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const refresh = useCallback(async () => {
    await refreshData();
  }, [refreshData]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
      addToast("error", "Core demorou para responder. Abra Configurações e verifique Java.");
    }, 95_000);
    return () => clearTimeout(t);
  }, [loading, addToast]);

  useEffect(() => {
    void refreshJdks();
  }, [refreshJdks]);

  useEffect(() => {
    void loadRuntimeSettings();
  }, [loadRuntimeSettings]);

  useEffect(() => {
    let cancel = false;
    const scheduleWorkspaceRefresh = () => {
      if (workspaceRefreshT.current) clearTimeout(workspaceRefreshT.current);
      workspaceRefreshT.current = setTimeout(() => {
        workspaceRefreshT.current = null;
        if (!cancel) void refresh();
      }, 400);
    };
    const promise = listen<CoreEvent>("core_event", (e) => {
      if (cancel) return;
      const raw = e.payload as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object") return;
      const ev = raw.event;
      const payload = raw.payload;
      if (ev === "service" && payload) {
        const svc = payload as ServiceDto;
        setServices((prev) => prev.map((s) => (s.name === svc.name ? svc : s)));
      } else if (ev === "services" && payload) {
        setServices(payload as ServiceDto[]);
      } else if (ev === "log") {
        return;
      } else if (ev === "workspace") {
        scheduleWorkspaceRefresh();
      }
    });
    return () => {
      cancel = true;
      if (workspaceRefreshT.current) clearTimeout(workspaceRefreshT.current);
      void promise.then((u) => u());
    };
  }, [refresh]);

  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
        return;
      }
      if (!selected) return;
      const s = services.find((sv) => sv.name === selected);
      if (!s) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (s.status !== "RUNNING") {
          void api.start(s.name).then(() => refresh());
          addToast("info", `Iniciando ${s.name}`);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "x") {
        e.preventDefault();
        if (s.status === "RUNNING") {
          void api.stop(s.name).then(() => refresh());
          addToast("info", `Parando ${s.name}`);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "r" && !e.shiftKey) {
        e.preventDefault();
        if (s.status === "RUNNING") {
          void api.restart(s.name).then(() => refresh());
          addToast("info", `Reiniciando ${s.name}`);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, services, refresh, addToast]);

  const handleServicesReorder = useCallback((reorderedSubset: ServiceDto[]) => {
    setServices((prev) => {
      const subNames = new Set(reorderedSubset.map((s) => s.name));
      const others = prev.filter((s) => !subNames.has(s.name));
      const merged: ServiceDto[] = [];
      let otherIdx = 0;
      let subIdx = 0;
      for (const s of prev) {
        if (subNames.has(s.name)) {
          if (subIdx < reorderedSubset.length) merged.push(reorderedSubset[subIdx++]);
        } else {
          if (otherIdx < others.length) merged.push(others[otherIdx++]);
        }
      }
      while (subIdx < reorderedSubset.length) merged.push(reorderedSubset[subIdx++]);
      while (otherIdx < others.length) merged.push(others[otherIdx++]);
      return merged;
    });
  }, []);

  const availableTechs = useMemo(() => {
    const set = new Set<ProjectType>();
    for (const s of services) if (s.projectType) set.add(s.projectType);
    return Array.from(set).sort();
  }, [services]);

  const containerServices = useMemo(
    () => (selectedContainer ? services.filter((s) => s.containerIds?.includes(selectedContainer)) : []),
    [services, selectedContainer],
  );

  const handleSelectContainer = useCallback(
    async (id: string | null) => {
      setSelectedContainer(id);
      if (id) {
        const svcInContainer = services.filter((s) => s.containerIds?.includes(id));
        if (svcInContainer.length < 2 && svcInContainer.length > 0) setSelected(svcInContainer[0].name);
      }
      setFilterText("");
      await refresh();
    },
    [services, refresh],
  );

  const handlePickJavaFolder = useCallback(async () => {
    const picked = await api.selectJavaFolder();
    if (!picked?.trim()) return;
    setRuntimeSettings((prev) => ({ ...prev, javaPath: picked.trim() }));
  }, []);

  const handlePickJavaFile = useCallback(async () => {
    const picked = await api.selectJavaFile();
    if (!picked?.trim()) return;
    setRuntimeSettings((prev) => ({ ...prev, javaPath: picked.trim() }));
  }, []);

  const handleSaveJavaPath = useCallback(
    async (value: string | null) => {
      setSavingJavaPath(true);
      try {
        const next = await api.setJavaRuntimePath(value);
        setRuntimeSettings(next);
        const ok = await refreshData();
        if (ok) {
          await refreshJdks();
          addToast("success", next.javaPath ? "Java configurado" : "Configuração do Java removida");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setJavaError(message);
        setSettingsOpen(true);
        addToast("error", message);
      } finally {
        setSavingJavaPath(false);
      }
    },
    [addToast, refreshData, refreshJdks],
  );

  const filteredServices = useMemo(() => {
    let f = selectedContainer ? containerServices : services;
    if (techFilter) f = f.filter((s) => (s.projectType ?? "SPRING_BOOT") === techFilter);
    if (filterText) {
      const t = filterText.toLowerCase();
      f = f.filter((s) => s.name.toLowerCase().includes(t) || s.path.toLowerCase().includes(t));
    }
    return f;
  }, [services, containerServices, selectedContainer, filterText, techFilter]);

  return (
    <div className="flex h-screen flex-col bg-surface-0 overflow-hidden">
      <Toolbar onSettings={() => setSettingsOpen(true)} />
      <main className="flex flex-1 min-h-0">
        <aside
          className="shrink-0 border-r border-white/[0.04]"
          style={{
            width: containersCollapsed ? 40 : sideW,
            transition: containersCollapsed ? "width 0.2s" : undefined,
          }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04]">
            <span
              className={`text-2xs font-semibold uppercase tracking-widest text-slate-600 transition-opacity ${containersCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}
            >
              Containers
            </span>
            <Tooltip text={containersCollapsed ? "Expandir" : "Recolher"}>
              <button className="btn-ghost rounded p-1" onClick={() => setContainersCollapsed(!containersCollapsed)}>
                <Icon.Chevron
                  className={`h-3 w-3 text-slate-600 transition-transform duration-200 ${containersCollapsed ? "rotate-180" : ""}`}
                />
              </button>
            </Tooltip>
          </div>
          <div
            className={`transition-opacity duration-200 ${containersCollapsed ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100 h-[calc(100%-37px)]"}`}
          >
            <ContainersPanel
              services={services}
              containers={containers}
              selectedContainer={selectedContainer}
              onSelectContainer={handleSelectContainer}
              onRefresh={refresh}
              onContainersChanged={refresh}
              onContainersReorder={setContainers}
              onToast={addToast}
            />
          </div>
        </aside>
        {!containersCollapsed && <ResizeHandle value={sideW} onChange={setSideW} min={140} max={320} />}

        <section className="flex flex-col shrink-0 border-r border-white/[0.04]" style={{ width: svcW }}>
          <div className="px-3 py-2.5 border-b border-white/[0.04] space-y-2">
            <ContainerTabs
              containers={containers}
              selectedContainer={selectedContainer}
              onSelect={handleSelectContainer}
            />
            <ImportSection onImported={refresh} addToast={addToast} />
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Icon.Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filtrar..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="input pl-7 text-2xs"
                />
              </div>
              {availableTechs.length > 1 && (
                <select
                  value={techFilter}
                  onChange={(e) => setTechFilter(e.target.value as ProjectType | "")}
                  className="input text-2xs px-1.5 py-1 w-auto shrink-0 cursor-pointer bg-surface-2 border-white/[0.06]"
                >
                  <option value="">Todos</option>
                  {availableTechs.map((t) => (
                    <option key={t} value={t}>
                      {TECH_LABELS[t]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            <ServiceTable
              services={filteredServices}
              allServices={services}
              selected={selected}
              onSelect={setSelected}
              onAction={refresh}
              onServicesUpdate={handleServicesReorder}
              selectedContainer={selectedContainer}
              containers={containers}
              jdks={jdks}
              onToast={addToast}
              loading={loading}
            />
          </div>
          <StatusBar
            services={services}
            selectedContainer={selectedContainer}
            filteredCount={filteredServices.length}
          />
        </section>
        <ResizeHandle value={svcW} onChange={setSvcW} min={220} max={450} />

        <section className="flex flex-1 min-w-0 flex-col relative">
          <LogsPanel
            service={selectedService}
            selectedContainer={selectedContainer}
            containerServices={containerServices}
            fontSize={settings.fontSize}
            lineWrap={settings.logLineWrap}
            onToast={addToast}
          />
        </section>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        javaPath={runtimeSettings.javaPath ?? ""}
        javaError={javaError}
        savingJavaPath={savingJavaPath}
        onPickJavaFolder={handlePickJavaFolder}
        onPickJavaFile={handlePickJavaFile}
        onSaveJavaPath={handleSaveJavaPath}
      />
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
}

function ResizeHandle(props: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = props.value;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const w = Math.min(props.max, Math.max(props.min, startW.current + ev.clientX - startX.current));
        props.onChange(w);
      };
      const onUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [props],
  );

  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-accent/20 active:bg-accent/40 transition-colors"
      onMouseDown={onDown}
    />
  );
}

function Toolbar(props: { onSettings: () => void }) {
  return (
    <header
      className="flex items-center justify-between gap-3 px-4 py-2 border-b border-[#ff7a0026] bg-[#04070d]/95 backdrop-blur-md shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <img
          src="/lemain-icon.png"
          alt="Orchestrator"
          className="h-7 w-7 rounded-xl border border-[#ff7a0045] shadow-[0_0_18px_rgba(255,122,0,0.2)] object-cover"
        />
        <span className="text-xs font-semibold text-slate-200 tracking-tight">Orchestrator</span>
      </div>
      <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <Tooltip text="Configurações (⌘ ,)">
          <button className="btn btn-ghost text-2xs px-1.5" onClick={props.onSettings}>
            <Icon.Settings className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

function ContainerTabs(props: {
  containers: ContainerDto[];
  selectedContainer: string | null;
  onSelect: (id: string | null) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
      <TabBtn active={props.selectedContainer === null} onClick={() => void props.onSelect(null)}>
        Todos
      </TabBtn>
      {props.containers.map((c) => (
        <TabBtn key={c.id} active={props.selectedContainer === c.id} onClick={() => void props.onSelect(c.id)}>
          {c.name}
        </TabBtn>
      ))}
    </div>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`rounded-md px-2.5 py-1 text-2xs font-medium whitespace-nowrap shrink-0 transition-all duration-150 ${props.active ? "bg-accent/15 text-accent" : "text-slate-500 hover:text-slate-300 hover:bg-surface-3"}`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
