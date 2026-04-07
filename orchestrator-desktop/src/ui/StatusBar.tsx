import type { ServiceDto } from "../api/types";

export function StatusBar(props: { services: ServiceDto[]; selectedContainer: string | null; filteredCount: number }) {
  const running = props.services.filter((s) => s.status === "RUNNING").length;
  const stopped = props.services.filter((s) => s.status === "STOPPED").length;
  const errors = props.services.filter((s) => s.status === "ERROR").length;
  const total = props.services.length;

  return (
    <div className="divider px-3 py-2 shrink-0">
      <div className="flex items-center justify-between text-2xs text-slate-500">
        <span className="font-medium">
          {props.filteredCount}/{total}
          {props.selectedContainer ? " filtrado" : ""}
        </span>
        <div className="flex items-center gap-3">
          {running > 0 && <Pill color="bg-mint" count={running} />}
          {stopped > 0 && <Pill color="bg-slate-600" count={stopped} />}
          {errors > 0 && <Pill color="bg-danger" count={errors} />}
        </div>
      </div>
    </div>
  );
}

function Pill(props: { color: string; count: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${props.color}`} />
      <span className="tabular-nums">{props.count}</span>
    </span>
  );
}
