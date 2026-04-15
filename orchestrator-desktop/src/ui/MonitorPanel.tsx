import { listen } from "@tauri-apps/api/event";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { ServiceDto } from "../api/types";
import { Icon } from "./Icons";
import type { ToastType } from "./Toast";
import { Tooltip } from "./Tooltip";

type CoreEvent = { event: string; payload: Record<string, unknown> };
type MonitorLine = { service: string; line: string };

const BADGE_COLORS = [
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#22c55e",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#0d9488",
  "#0284c7",
  "#4f46e5",
  "#16a34a",
  "#0e7490",
  "#1d4ed8",
  "#6d28d9",
  "#7e22ce",
  "#a21caf",
  "#be185d",
  "#0f766e",
  "#0369a1",
  "#4338ca",
  "#15803d",
  "#155e75",
  "#1e40af",
  "#5b21b6",
  "#6b21a8",
  "#86198f",
  "#9d174d",
  "#115e59",
  "#075985",
  "#3730a3",
  "#166534",
  "#164e63",
  "#1e3a8a",
  "#4c1d95",
  "#581c87",
  "#701a75",
  "#831843",
  "#134e4a",
  "#0c4a6e",
  "#312e81",
];

function getColor(index: number): string {
  return BADGE_COLORS[index % BADGE_COLORS.length];
}

export function MonitorPanel(props: {
  services: ServiceDto[];
  fontSize?: number;
  lineWrap?: boolean;
  onToast?: (t: ToastType, m: string) => void;
}) {
  const [lines, setLines] = useState<MonitorLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [markA, setMarkA] = useState<number | null>(null);
  const [markB, setMarkB] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  const serviceNames = useMemo(() => props.services.map((s) => s.name).sort(), [props.services]);
  const svcKey = serviceNames.join(",");

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    serviceNames.forEach((name, i) => m.set(name, getColor(i)));
    return m;
  }, [serviceNames]);

  useEffect(() => {
    setLines([]);
    setConnected(false);
    setSearch("");
    if (serviceNames.length === 0) return;

    let alive = true;
    let unlisten: (() => void) | null = null;
    const subIds: string[] = [];
    const subIdToService = new Map<string, string>();

    (async () => {
      unlisten = await listen<CoreEvent>("core_event", (e) => {
        if (!alive) return;
        const ev = e.payload as Record<string, unknown>;
        if (!ev || ev.event !== "log") return;
        const p = ev.payload as Record<string, unknown> | undefined;
        if (!p) return;
        const sid = String(p.subId ?? "");
        const fromMap = sid ? subIdToService.get(sid) : undefined;
        const svcName = String(p.service ?? "");
        const svc =
          fromMap ?? (svcName && serviceNames.includes(svcName) ? svcName : undefined);
        if (!svc) return;
        const msg = String(p.line ?? "");
        if (msg) {
          setLines((prev) => {
            const n = [...prev, { service: svc, line: msg }];
            return n.length > 2000 ? n.slice(-2000) : n;
          });
        }
      });
      for (const name of serviceNames) {
        try {
          const sub = await api.subscribeLogs(name, 50);
          if (!alive) {
            void api.unsubscribeLogs(sub.subId).catch(() => {});
            continue;
          }
          subIds.push(sub.subId);
          subIdToService.set(sub.subId, name);
        } catch {}
      }
      if (alive) setConnected(true);
    })().catch(() => {});

    return () => {
      alive = false;
      setConnected(false);
      if (unlisten) unlisten();
      for (const id of subIds) void api.unsubscribeLogs(id).catch(() => {});
    };
  }, [svcKey]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setShowSearch(false);
        setSearch("");
        setMarkA(null);
        setMarkB(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!showLegend) return;
    const h = (e: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setShowLegend(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showLegend]);

  const toast = props.onToast;
  function flash() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function copyAll() {
    if (lines.length === 0) {
      toast?.("info", "Nenhum log para copiar");
      return;
    }
    const text = lines.map((l) => `[${l.service}] ${l.line}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      flash();
      toast?.("success", `${lines.length} linhas copiadas`);
    } catch {}
  }

  function clearLogs() {
    setLines([]);
    setMarkA(null);
    setMarkB(null);
    toast?.("info", "Logs limpos");
  }

  function handleLineClick(idx: number) {
    if (markA === null) {
      setMarkA(idx);
      setMarkB(null);
    } else if (markB === null) {
      setMarkB(idx);
    } else {
      setMarkA(idx);
      setMarkB(null);
    }
  }

  async function copyRange() {
    if (markA === null || markB === null) return;
    const lo = Math.min(markA, markB);
    const hi = Math.max(markA, markB);
    const count = hi - lo + 1;
    const text = lines
      .slice(lo, hi + 1)
      .map((l) => `[${l.service}] ${l.line}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      flash();
      toast?.("success", `${count} linhas copiadas`);
    } catch {}
    setMarkA(null);
    setMarkB(null);
  }

  const rangeMin = markA !== null && markB !== null ? Math.min(markA, markB) : null;
  const rangeMax = markA !== null && markB !== null ? Math.max(markA, markB) : null;

  const filtered = search
    ? lines.map((l, i) => ({ ...l, i })).filter(({ line }) => line.toLowerCase().includes(search.toLowerCase()))
    : lines.map((l, i) => ({ ...l, i }));

  const logFontSize = props.fontSize ?? 12;
  const wrap = props.lineWrap !== false;

  return (
    <div className="flex flex-1 min-h-0 flex-col select-none">
      <div className="px-4 py-2.5 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon.Log className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <span className="truncate text-xs font-medium text-slate-200">Monitor</span>
            <span className="badge bg-accent/10 text-accent shrink-0">{serviceNames.length} serviços</span>
            {connected && <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="relative">
              <Tooltip text="Legendas">
                <button
                  className={`btn btn-ghost px-2 py-1 ${showLegend ? "bg-accent/15 text-accent" : ""}`}
                  onClick={() => setShowLegend(!showLegend)}
                >
                  <Icon.Palette className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              {showLegend && (
                <div
                  ref={legendRef}
                  className="absolute right-0 top-full mt-1 z-[300] w-56 rounded-lg border border-white/[0.08] bg-surface-2 shadow-elevated backdrop-blur-xl animate-scale-in"
                >
                  <div className="px-3 py-2 border-b border-white/[0.06]">
                    <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Legendas</span>
                  </div>
                  <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                    {serviceNames.map((name, i) => (
                      <div key={name} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-surface-3">
                        <span className="shrink-0 w-3 h-3 rounded" style={{ backgroundColor: getColor(i) }} />
                        <span className="text-xs text-slate-300 truncate">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Tooltip text="Buscar (⌘F)">
              <button
                className={`btn btn-ghost px-2 py-1 ${showSearch ? "bg-accent/15 text-accent" : ""}`}
                onClick={() => {
                  setShowSearch(!showSearch);
                  if (!showSearch) setTimeout(() => searchRef.current?.focus(), 50);
                }}
              >
                <Icon.Search className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip text="Copiar tudo">
              <button
                className={`btn btn-ghost px-2 py-1 ${copied ? "bg-accent/15 text-accent" : ""}`}
                onClick={() => void copyAll()}
              >
                <Icon.Copy className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="w-px h-4 bg-white/[0.06] mx-1" />
            <Tooltip text="Limpar logs">
              <button className="btn btn-ghost px-2 py-1" onClick={clearLogs}>
                <Icon.Trash className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>
        {showSearch && (
          <div className="flex items-center gap-2 animate-slide-up">
            <div className="relative flex-1">
              <Icon.Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar nos logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowSearch(false);
                    setSearch("");
                  }
                }}
              />
            </div>
            {search && <span className="text-2xs text-slate-500 tabular-nums shrink-0">{filtered.length}</span>}
          </div>
        )}
      </div>
      <div className="divider" />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-surface-0/50 px-4 py-3 font-mono leading-relaxed select-text cursor-text"
        style={{ fontSize: `${logFontSize}px` }}
      >
        {filtered.map(({ service, line, i }) => {
          const color = colorMap.get(service) ?? "#64748b";
          const isMarked = markA === i || markB === i;
          const inRange = rangeMin !== null && rangeMax !== null && i >= rangeMin && i <= rangeMax;
          return (
            <div
              key={i}
              onClick={() => handleLineClick(i)}
              className={`flex items-start gap-0 py-px cursor-pointer transition-colors ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"} rounded px-1.5 -mx-1 ${isMarked ? "bg-accent/25 ring-1 ring-accent/50" : inRange ? "bg-accent/15" : "hover:bg-white/[0.04]"}`}
            >
              <span
                className="shrink-0 inline-flex items-center rounded px-1.5 py-px text-[10px] font-bold leading-tight mr-2 mt-px"
                style={{ backgroundColor: color, color: "#0f0f0f" }}
              >
                {service}
              </span>
              <span className={getLineColor(line)}>{search ? highlight(line, search) : line}</span>
            </div>
          );
        })}
        {lines.length === 0 && connected && (
          <p className="text-slate-600 animate-pulse font-sans text-xs select-none">Aguardando logs dos serviços...</p>
        )}
        {lines.length === 0 && !connected && (
          <p className="text-slate-700 font-sans text-xs select-none">Conectando aos serviços...</p>
        )}
        <div ref={bottomRef} />
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
              <button
                className="btn btn-ghost text-2xs px-1.5 py-1 text-slate-500"
                onClick={() => {
                  setMarkA(null);
                  setMarkB(null);
                  toast?.("info", "Seleção cancelada");
                }}
              >
                <Icon.X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
      {!autoScroll && lines.length > 0 && (
        <button
          className="absolute bottom-6 right-6 btn btn-primary shadow-glow animate-slide-up select-none"
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ block: "end" });
          }}
        >
          <Icon.ArrowDown className="h-3 w-3" /> Final
        </button>
      )}
    </div>
  );
}

function highlight(line: string, search: string): ReactNode {
  const parts: ReactNode[] = [];
  const lower = line.toLowerCase();
  const sLower = search.toLowerCase();
  let last = 0;
  let pos = lower.indexOf(sLower, last);
  while (pos !== -1) {
    if (pos > last) parts.push(line.slice(last, pos));
    parts.push(
      <mark key={pos} className="bg-accent/30 text-accent rounded px-0.5">
        {line.slice(pos, pos + search.length)}
      </mark>,
    );
    last = pos + search.length;
    pos = lower.indexOf(sLower, last);
  }
  if (last < line.length) parts.push(line.slice(last));
  return <>{parts}</>;
}

function getLineColor(line: string): string {
  const u = line.toUpperCase();
  if (u.includes("ERROR") || u.includes("EXCEPTION") || u.includes("FATAL")) return "text-red-400";
  if (u.includes("WARN")) return "text-amber-400";
  if (u.includes("DEBUG") || u.includes("TRACE")) return "text-slate-600";
  if (u.includes("INFO")) return "text-sky-400";
  return "text-slate-400";
}
