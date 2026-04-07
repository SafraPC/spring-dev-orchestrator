import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import type { ContainerDto, JdkInfo, ServiceDto } from "../api/types";
import { ContainersPanel } from "./ContainersPanel";
import { ImportSection } from "./ImportSection";
import { LogsPanel } from "./LogsPanel";
import { ServiceTable } from "./ServiceTable";
import { StatusBar } from "./StatusBar";
import { Toast, useToast } from "./Toast";
import { Icon } from "./Icons";
import { SettingsPanel, useSettings } from "./SettingsPanel";
import { Tooltip } from "./Tooltip";

export function App() {
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [containersCollapsed, setContainersCollapsed] = useState(false);
  const [containers, setContainers] = useState<ContainerDto[]>([]);
  const [jdks, setJdks] = useState<JdkInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sideW, setSideW] = useState(200);
  const [svcW, setSvcW] = useState(288);
  const { toasts, addToast, removeToast } = useToast();
  const { settings, setSettings } = useSettings();

  const selectedService = useMemo(() => services.find((s) => s.name === selected) ?? null, [services, selected]);

  const refresh = useCallback(async () => {
    const [list, ctrs] = await Promise.all([api.listServices(), api.listContainers()]);
    setServices(list);
    setContainers(ctrs);
    setSelected((prev) => prev && !list.some((s) => s.name === prev) ? null : prev);
  }, []);

  useEffect(() => { void refresh(); const i = setInterval(() => void refresh(), 5000); return () => clearInterval(i); }, [refresh]);
  useEffect(() => { void api.listJdks().then(setJdks).catch(() => {}); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); setSettingsOpen((v) => !v); return; }
      if (!selected) return;
      const s = services.find((sv) => sv.name === selected);
      if (!s) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (s.status !== "RUNNING") { void api.start(s.name).then(() => refresh()); addToast("info", `Iniciando ${s.name}`); } }
      if ((e.metaKey || e.ctrlKey) && e.key === "x") { e.preventDefault(); if (s.status === "RUNNING") { void api.stop(s.name).then(() => refresh()); addToast("info", `Parando ${s.name}`); } }
      if ((e.metaKey || e.ctrlKey) && e.key === "r" && !e.shiftKey) { e.preventDefault(); if (s.status === "RUNNING") { void api.restart(s.name).then(() => refresh()); addToast("info", `Reiniciando ${s.name}`); } }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selected, services, refresh, addToast]);

  const filteredServices = useMemo(() => {
    let f = selectedContainer ? services.filter((s) => s.containerIds?.includes(selectedContainer)) : services;
    if (filterText) { const t = filterText.toLowerCase(); f = f.filter((s) => s.name.toLowerCase().includes(t) || s.path.toLowerCase().includes(t)); }
    return f;
  }, [services, selectedContainer, filterText]);

  return (
    <div className="flex h-screen flex-col bg-surface-0 overflow-hidden">
      <Toolbar onSettings={() => setSettingsOpen(true)} />
      <main className="flex flex-1 min-h-0">
        <aside className="shrink-0 border-r border-white/[0.04]" style={{ width: containersCollapsed ? 40 : sideW, transition: containersCollapsed ? "width 0.2s" : undefined }}>
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.04]">
            <span className={`text-2xs font-semibold uppercase tracking-widest text-slate-600 transition-opacity ${containersCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}>Containers</span>
            <Tooltip text={containersCollapsed ? "Expandir" : "Recolher"}>
              <button className="btn-ghost rounded p-1" onClick={() => setContainersCollapsed(!containersCollapsed)}>
                <Icon.Chevron className={`h-3 w-3 text-slate-600 transition-transform duration-200 ${containersCollapsed ? "rotate-180" : ""}`} />
              </button>
            </Tooltip>
          </div>
          <div className={`transition-opacity duration-200 ${containersCollapsed ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100 h-[calc(100%-37px)]"}`}>
            <ContainersPanel services={services} containers={containers} selectedContainer={selectedContainer} onSelectContainer={async (id) => { setSelectedContainer(id); await refresh(); }} onRefresh={refresh} onContainersChanged={refresh} />
          </div>
        </aside>
        {!containersCollapsed && <ResizeHandle value={sideW} onChange={setSideW} min={140} max={320} />}

        <section className="flex flex-col shrink-0 border-r border-white/[0.04]" style={{ width: svcW }}>
          <div className="px-3 py-2.5 border-b border-white/[0.04] space-y-2">
            <ContainerTabs containers={containers} selectedContainer={selectedContainer} onSelect={async (id) => { setSelectedContainer(id); setFilterText(""); await refresh(); }} />
            <ImportSection onImported={refresh} addToast={addToast} />
            <div className="relative">
              <Icon.Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600 pointer-events-none" />
              <input type="text" placeholder="Filtrar serviços..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="input pl-7 text-2xs" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            <ServiceTable services={filteredServices} selected={selected} onSelect={setSelected} onAction={refresh} onServicesUpdate={setServices} selectedContainer={selectedContainer} containers={containers} jdks={jdks} onToast={addToast} />
          </div>
          <StatusBar services={services} selectedContainer={selectedContainer} filteredCount={filteredServices.length} />
        </section>
        <ResizeHandle value={svcW} onChange={setSvcW} min={220} max={450} />

        <section className="flex flex-1 min-w-0 flex-col relative">
          <LogsPanel service={selectedService} fontSize={settings.fontSize} lineWrap={settings.logLineWrap} onToast={addToast} />
        </section>
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={setSettings} />
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => <Toast key={t.id} toast={t} onClose={removeToast} />)}
      </div>
    </div>
  );
}

function ResizeHandle(props: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onDown = useCallback((e: React.MouseEvent) => {
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
  }, [props]);

  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-accent/20 active:bg-accent/40 transition-colors"
      onMouseDown={onDown}
    />
  );
}

function Toolbar(props: { onSettings: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.04] bg-surface-1/80 backdrop-blur-md shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="h-5 w-5 rounded bg-gradient-to-br from-accent to-emerald-400 flex items-center justify-center">
          <Icon.Box className="h-3 w-3 text-surface-0" />
        </div>
        <span className="text-xs font-semibold text-slate-300 tracking-tight">Orchestrator</span>
      </div>
      <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <Tooltip text="Configurações (⌘ ,)">
          <button className="btn btn-ghost text-2xs px-1.5" onClick={props.onSettings}><Icon.Settings className="h-3.5 w-3.5" /></button>
        </Tooltip>
      </div>
    </header>
  );
}

function ContainerTabs(props: { containers: ContainerDto[]; selectedContainer: string | null; onSelect: (id: string | null) => Promise<void> }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
      <TabBtn active={props.selectedContainer === null} onClick={() => void props.onSelect(null)}>Todos</TabBtn>
      {props.containers.map((c) => <TabBtn key={c.id} active={props.selectedContainer === c.id} onClick={() => void props.onSelect(c.id)}>{c.name}</TabBtn>)}
    </div>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`rounded-md px-2.5 py-1 text-2xs font-medium whitespace-nowrap shrink-0 transition-all duration-150 ${props.active ? "bg-accent/15 text-accent" : "text-slate-500 hover:text-slate-300 hover:bg-surface-3"}`} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
