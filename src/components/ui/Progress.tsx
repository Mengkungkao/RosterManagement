import { cn } from "./cn";

// A thin bar for "filled of needed". Always shown next to the numbers.
export function Progress({ value, max, className = "", label }: { value: number; max: number; className?: string; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 1;
  const tone = max === 0 || ratio >= 1 ? "bg-success" : ratio > 0 ? "bg-warning" : "bg-danger";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(ratio * 100, max > 0 && value === 0 ? 0 : 4)}%` }} />
    </div>
  );
}
