import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ServiceDto } from "../api/types";
import { Icon } from "./Icons";
import { MonitorPanel } from "./MonitorPanel";
import { Tooltip } from "./Tooltip";

type CoreEvent = { event: string; payload: Record<string, unknown> };

function classify(line: string): "error" | "warn" | "info" | "debug" | "status" | "normal" {
  if (line.includes("[STATUS]")) return "status";
  const u = line.toUpperCase();
  if (u.includes("ERROR") || u.includes("EXCEPTION") || u.includes("FATAL")) return "error";
  if (u.includes("WARN")) return "warn";
  if (u.includes("DEBUG") || u.includes("TRACE")) return "debug";
  if (u.includes("INFO")) return "info";
  return "normal";
}

const COLORS: Record<ReturnType<typeof classify>, string> = {
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-sky-400",
  debug: "text-slate-600",
  status: "text-yellow-300",
  normal: "text-slate-400",
};

import type { ToastType } from "./Toast";

export function LogsPanel(props: {
  service: ServiceDto | null;
  selectedContainer?: string | null;
  containerServices?: ServiceDto[];
  fontSize?: number;
  lineWrap?: boolean;
  onToast?: (t: ToastType, m: string) => void;
}) {
  const [mode, setMode] = useState<"service" | "monitor">("service");
  const canMonitor = (props.containerServices?.length ?? 0) >= 2 && !!props.selectedContainer;

  useEffect(() => { if (!canMonitor) setMode("service"); }, [canMonitor]);

  if (mode === "monitor" && canMonitor) {
    return (
      <div className="flex h-full flex-col">
        <MonitorTabs mode={mode} onMode={setMode} canMonitor={canMonitor} />
        <MonitorPanel services={props.containerServices!} fontSize={props.fontSize} lineWrap={props.lineWrap} onToast={props.onToast} />
      </div>
    );
  }

  return <ServiceLogView service={props.service} fontSize={props.fontSize} lineWrap={props.lineWrap} onToast={props.onToast} mode={mode} onMode={setMode} canMonitor={canMonitor} />;
}

function MonitorTabs(props: { mode: "service" | "monitor"; onMode: (m: "service" | "monitor") => void; canMonitor: boolean }) {
  if (!props.canMonitor) return null;
  return (
    <div className="flex items-center gap-1 px-4 pt-2 shrink-0">
      <button className={`rounded-md px-2.5 py-1 text-2xs font-medium transition-all duration-150 ${props.mode === "service" ? "bg-accent/15 text-accent" : "text-slate-500 hover:text-slate-300 hover:bg-surface-3"}`}
        onClick={() => props.onMode("service")}>Serviço</button>
      <button className={`rounded-md px-2.5 py-1 text-2xs font-medium transition-all duration-150 ${props.mode === "monitor" ? "bg-accent/15 text-accent" : "text-slate-500 hover:text-slate-300 hover:bg-surface-3"}`}
        onClick={() => props.onMode("monitor")}>Monitor</button>
    </div>
  );
}

function ServiceLogView(props: {
  service: ServiceDto | null;
  fontSize?: number;
  lineWrap?: boolean;
  onToast?: (t: ToastType, m: string) => void;
  mode: "service" | "monitor";
  onMode: (m: "service" | "monitor") => void;
  canMonitor: boolean;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [hasLogs, setHasLogs] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [markA, setMarkA] = useState<number | null>(null);
  const [markB, setMarkB] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const svcName = props.service?.name ?? null;

  useEffect(() => {
    setLines([]); setConnected(false); setHasLogs(false); setSearch("");
    setMarkA(null); setMarkB(null);
    if (!svcName) return;
    let unlisten: null | (() => void) = null;
    let alive = true;
    let subId: string | null = null;
    (async () => {
      unlisten = await listen<CoreEvent>("core_event", (e) => {
        if (!alive) return;
        const ev = e.payload as Record<string, unknown>;
        if (!ev || ev.event !== "log") return;
        const p = ev.payload as Record<string, unknown> | undefined;
        if (!p || !subId || p.subId !== subId) return;
        const msg = String(p.line ?? "");
        if (msg) {
          setHasLogs(true);
          setLines((prev) => { const n = [...prev, msg]; return n.length > 2000 ? n.slice(-2000) : n; });
        }
      });
      try {
        const sub = await api.subscribeLogs(svcName, 200);
        if (!alive) { await api.unsubscribeLogs(sub.subId).catch(() => {}); return; }
        subId = sub.subId; setConnected(true);
      } catch (err) { setLines([`Erro: ${err instanceof Error ? err.message : String(err)}`]); }
    })().catch((err) => setLines([`Erro: ${err instanceof Error ? err.message : String(err)}`]));
    return () => { alive = false; setConnected(false); if (unlisten) unlisten(); if (subId) void api.unsubscribeLogs(subId).catch(() => {}); };
  }, [svcName]);

  useEffect(() => { if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" }); }, [lines.length, autoScroll]);
  const handleScroll = useCallback(() => { const el = scrollRef.current; if (el) setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && svcName) { e.preventDefault(); setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50); }
      if (e.key === "Escape") { setShowSearch(false); setSearch(""); setMarkA(null); setMarkB(null); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [svcName]);

  function handleLineClick(idx: number) {
    if (markA === null) {
      setMarkA(idx); setMarkB(null);
    } else if (markB === null) {
      setMarkB(idx);
    } else {
      setMarkA(idx); setMarkB(null);
    }
  }

  const toast = props.onToast;

  async function copyRange() {
    if (markA === null || markB === null) return;
    const lo = Math.min(markA, markB);
    const hi = Math.max(markA, markB);
    const count = hi - lo + 1;
    const text = lines.slice(lo, hi + 1).join("\n");
    try { await navigator.clipboard.writeText(text); flash(); toast?.("success", `${count} linhas copiadas`); } catch {}
    setMarkA(null); setMarkB(null);
  }

  async function copyAll() {
    if (lines.length === 0) { toast?.("info", "Nenhum log para copiar"); return; }
    try { await navigator.clipboard.writeText(lines.join("\n")); flash(); toast?.("success", `${lines.length} linhas copiadas`); } catch {}
  }

  function clearLogs() {
    setLines([]);
    setMarkA(null); setMarkB(null);
    toast?.("info", "Logs limpos");
  }

  function flash() { setCopied(true); setTimeout(() => setCopied(false), 1500); }

  const filtered = search ? lines.map((l, i) => ({ l, i })).filter(({ l }) => l.toLowerCase().includes(search.toLowerCase())) : lines.map((l, i) => ({ l, i }));
  const isRunning = props.service?.status === "RUNNING";
  const isError = props.service?.status === "ERROR";
  const logFontSize = props.fontSize ?? 12;
  const wrap = props.lineWrap !== false;
  const rangeMin = markA !== null && markB !== null ? Math.min(markA, markB) : null;
  const rangeMax = markA !== null && markB !== null ? Math.max(markA, markB) : null;

  return (
    <div className="flex h-full flex-col select-none">
      <MonitorTabs mode={props.mode} onMode={props.onMode} canMonitor={props.canMonitor} />
      <div className="px-4 py-2.5 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon.Log className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            {svcName ? (<>
              <span className="truncate text-xs font-medium text-slate-200">{svcName}</span>
              {isRunning && <span className="badge bg-accent/10 text-accent shrink-0">Ativo</span>}
              {isError && <span className="badge bg-danger/10 text-danger shrink-0">Erro</span>}
              {!isRunning && !isError && <span className="badge bg-surface-3 text-slate-500 shrink-0">Parado</span>}
              {connected && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasLogs ? "bg-accent" : "bg-warn animate-pulse"}`} />}
            </>) : <span className="text-xs text-slate-600">Selecione um serviço</span>}
          </div>
          {svcName && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip text="Buscar (⌘F)">
                <ToolbarBtn icon="Search" active={showSearch} onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 50); }} />
              </Tooltip>
              <Tooltip text="Copiar tudo">
                <ToolbarBtn icon="Copy" active={copied} onClick={() => void copyAll()} />
              </Tooltip>
              <div className="w-px h-4 bg-white/[0.06] mx-1" />
              <Tooltip text="Limpar logs">
                <ToolbarBtn icon="Trash" onClick={clearLogs} />
              </Tooltip>
            </div>
          )}
        </div>
        {showSearch && (
          <div className="flex items-center gap-2 animate-slide-up">
            <div className="relative flex-1">
              <Icon.Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
              <input ref={searchRef} type="text" placeholder="Buscar nos logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-7 text-xs"
                onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearch(""); } }} />
            </div>
            {search && <span className="text-2xs text-slate-500 tabular-nums shrink-0">{filtered.length}</span>}
          </div>
        )}
      </div>
      <div className="divider" />
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-surface-0/50 px-4 py-3 font-mono leading-relaxed select-text cursor-text" style={{ fontSize: `${logFontSize}px` }}>
        {svcName ? (<>
          {filtered.map(({ l, i }) => {
            const isMarked = markA === i || markB === i;
            const inRange = rangeMin !== null && rangeMax !== null && i >= rangeMin && i <= rangeMax;
            return (
              <div key={i}
                className={`rounded px-1.5 -mx-1 py-px cursor-pointer transition-colors ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"} ${isMarked ? "bg-accent/25 ring-1 ring-accent/50" : inRange ? "bg-accent/15" : "hover:bg-white/[0.04]"} ${COLORS[classify(l)]}`}
                onClick={() => handleLineClick(i)}>
                {search ? highlight(l, search) : l}
              </div>
            );
          })}
          {lines.length === 0 && connected && !hasLogs && <p className="text-slate-600 animate-pulse font-sans text-xs select-none">Aguardando logs...</p>}
          {lines.length === 0 && !connected && <p className="text-slate-700 font-sans text-xs select-none">Conectando...</p>}
          <div ref={bottomRef} />
        </>) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in font-sans select-none">
            <Icon.Log className="h-10 w-10 mb-3 text-slate-800" />
            <p className="text-xs text-slate-600">Selecione um serviço</p>
            <p className="text-2xs text-slate-700 mt-1">Logs aparecem em tempo real</p>
          </div>
        )}
      </div>
      {markA !== null && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 animate-slide-up z-10">
          {markB === null ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-surface-3 border border-accent/25 text-accent shadow-glow-accent text-xs px-3 py-1.5 font-medium">
              <Icon.Pencil className="h-3 w-3" />
              Clique em outra linha para selecionar o trecho
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg bg-surface-3 border border-accent/25 shadow-glow-accent text-xs px-2 py-1">
              <span className="text-accent font-medium tabular-nums">{Math.abs(markB - markA) + 1} linhas</span>
              <button className="btn btn-primary text-2xs px-2.5 py-1" onClick={() => void copyRange()}>
                <Icon.Copy className="h-3 w-3" /> Copiar
              </button>
              <button className="btn btn-ghost text-2xs px-1.5 py-1 text-slate-500" onClick={() => { setMarkA(null); setMarkB(null); toast?.("info", "Seleção cancelada"); }}>
                <Icon.X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
      {!autoScroll && lines.length > 0 && (
        <button className="absolute bottom-6 right-6 btn btn-primary shadow-glow animate-slide-up select-none" onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ block: "end" }); }}>
          <Icon.ArrowDown className="h-3 w-3" /> Final
        </button>
      )}
    </div>
  );
}

function ToolbarBtn(props: { icon: keyof typeof Icon; active?: boolean; onClick: () => void }) {
  const Ic = Icon[props.icon];
  return (
    <button className={`btn btn-ghost px-2 py-1 ${props.active ? "bg-accent/15 text-accent" : ""}`} onClick={props.onClick}>
      <Ic className="h-3.5 w-3.5" />
    </button>
  );
}

function highlight(line: string, search: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lower = line.toLowerCase();
  const sLower = search.toLowerCase();
  let last = 0;
  let pos = lower.indexOf(sLower, last);
  while (pos !== -1) {
    if (pos > last) parts.push(line.slice(last, pos));
    parts.push(<mark key={pos} className="bg-accent/30 text-accent rounded px-0.5">{line.slice(pos, pos + search.length)}</mark>);
    last = pos + search.length;
    pos = lower.indexOf(sLower, last);
  }
  if (last < line.length) parts.push(line.slice(last));
  return <>{parts}</>;
}
