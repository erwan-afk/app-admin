import { cn } from "@/lib/utils";

/** Couleur d'avancement (reprend la logique pctColor de l'admin vanilla). */
export function pctColorClass(pct: number, over = false): string {
  if (over) return "bg-amber-500";
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 50) return "bg-primary";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

export function ProgressBar({
  pct,
  over = false,
  className,
}: {
  pct: number;
  over?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("bg-muted h-1.5 w-full overflow-hidden rounded-full", className)}>
      <div
        className={cn("h-full rounded-full transition-all", pctColorClass(pct, over))}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

/** Sparkline SVG à partir d'une série de valeurs. */
export function Sparkline({ values, w = 110, h = 26 }: { values: number[]; w?: number; h?: number }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`)
    .join(" ");
  const lastX = ((values.length - 1) * step).toFixed(1);
  const lastY = (h - 3 - ((values[values.length - 1] - min) / span) * (h - 6)).toFixed(1);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-primary">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="2.5" fill="currentColor" />
    </svg>
  );
}
