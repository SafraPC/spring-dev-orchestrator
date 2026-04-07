import { useEffect, useState } from "react";
import { Icon } from "./Icons";

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18] as const;
const ZOOM_LEVELS = [80, 90, 100, 110, 120, 130] as const;
const STORAGE_KEY = "orchestrator-settings";

export type Settings = {
  fontSize: number;
  zoom: number;
  logLineWrap: boolean;
};

const DEFAULTS: Settings = { fontSize: 12, zoom: 100, logLineWrap: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    save(settings);
    document.documentElement.style.fontSize = `${settings.zoom}%`;
  }, [settings]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setSettings((p) => {
          const idx = ZOOM_LEVELS.indexOf(p.zoom as (typeof ZOOM_LEVELS)[number]);
          const next = idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : p.zoom;
          return { ...p, zoom: next ?? p.zoom };
        });
      }
      if (e.key === "-") {
        e.preventDefault();
        setSettings((p) => {
          const idx = ZOOM_LEVELS.indexOf(p.zoom as (typeof ZOOM_LEVELS)[number]);
          const next = idx > 0 ? ZOOM_LEVELS[idx - 1] : p.zoom;
          return { ...p, zoom: next ?? p.zoom };
        });
      }
      if (e.key === "0") {
        e.preventDefault();
        setSettings((p) => ({ ...p, zoom: 100 }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { settings, setSettings };
}

export function SettingsPanel(props: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  if (!props.open) return null;

  const { settings, onChange } = props;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={props.onClose} />
      <div className="fixed inset-x-0 top-12 mx-auto z-50 w-80 animate-scale-in rounded-xl border border-white/[0.08] bg-surface-2 shadow-elevated">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Icon.Settings className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-200">Configurações</span>
          </div>
          <button className="btn-ghost rounded p-1" onClick={props.onClose}>
            <Icon.X className="h-3 w-3 text-slate-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <SettingRow label="Zoom da interface">
            <div className="flex items-center gap-2">
              <button className="btn-ghost rounded p-1" onClick={() => {
                const idx = ZOOM_LEVELS.indexOf(settings.zoom as (typeof ZOOM_LEVELS)[number]);
                if (idx > 0) onChange({ ...settings, zoom: ZOOM_LEVELS[idx - 1] });
              }}>
                <Icon.ZoomOut className="h-3 w-3 text-slate-400" />
              </button>
              <span className="text-xs font-mono text-slate-300 w-10 text-center tabular-nums">{settings.zoom}%</span>
              <button className="btn-ghost rounded p-1" onClick={() => {
                const idx = ZOOM_LEVELS.indexOf(settings.zoom as (typeof ZOOM_LEVELS)[number]);
                if (idx < ZOOM_LEVELS.length - 1) onChange({ ...settings, zoom: ZOOM_LEVELS[idx + 1] });
              }}>
                <Icon.ZoomIn className="h-3 w-3 text-slate-400" />
              </button>
            </div>
          </SettingRow>

          <SettingRow label="Tamanho da fonte (logs)">
            <select
              className="input py-1 px-2 w-20 text-xs"
              value={settings.fontSize}
              onChange={(e) => onChange({ ...settings, fontSize: Number(e.target.value) })}
            >
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
            </select>
          </SettingRow>

          <SettingRow label="Quebrar linhas (logs)">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.logLineWrap}
                onChange={(e) => onChange({ ...settings, logLineWrap: e.target.checked })}
              />
              <div className="w-8 h-[18px] bg-surface-4 rounded-full peer peer-checked:bg-accent/50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5" />
            </label>
          </SettingRow>

          <div className="divider" />
          <div className="text-2xs text-slate-600 space-y-1">
            <p><kbd className="kbd">⌘ +</kbd> / <kbd className="kbd">⌘ -</kbd> Zoom</p>
            <p><kbd className="kbd">⌘ 0</kbd> Reset zoom</p>
          </div>
        </div>
      </div>
    </>
  );
}

function SettingRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-400">{props.label}</span>
      {props.children}
    </div>
  );
}
