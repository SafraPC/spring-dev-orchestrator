import { useState } from "react";
import { api } from "../api/client";
import { Icon } from "./Icons";
import type { ToastType } from "./Toast";

export function ImportSection(props: {
  onImported: () => Promise<void>;
  addToast: (type: ToastType, msg: string) => void;
}) {
  const [rootInput, setRootInput] = useState("");
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    setImporting(true);
    try {
      let path: string | null = null;
      if (!rootInput.trim()) {
        const picked = await api.selectFolder();
        if (picked?.trim()) {
          path = picked.trim();
          setRootInput(path);
        } else {
          props.addToast("error", "Nenhuma pasta selecionada.");
          setImporting(false);
          return;
        }
      } else {
        path = rootInput.trim();
      }
      const result = await api.importRootAndScan(path);
      const count = Array.isArray(result) ? result.length : 0;
      if (count > 0) {
        props.addToast("success", `${count} serviço(s) descoberto(s)`);
        setRootInput("");
        await props.onImported();
      } else {
        props.addToast("error", "Nenhum serviço Spring Boot encontrado.");
      }
    } catch (e) {
      props.addToast("error", e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1 min-w-0">
        <Icon.Folder className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600 pointer-events-none" />
        <input
          value={rootInput}
          onChange={(e) => setRootInput(e.target.value)}
          placeholder="Caminho ou selecione..."
          className="input pl-7 pr-2 py-1.5 text-2xs"
          disabled={importing}
          onKeyDown={(e) => e.key === "Enter" && void handleImport()}
        />
      </div>
      <button className="btn btn-primary py-1.5 text-2xs" disabled={importing} onClick={() => void handleImport()}>
        {importing ? <span className="animate-spin-slow inline-block">⟳</span> : <Icon.Import className="h-3 w-3" />}
      </button>
    </div>
  );
}
