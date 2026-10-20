import { chip, tones } from "../ui";

// "2/3": filled positions of what's needed, with an icon and words as well
// as colour, so it reads without colour too.
export default function StaffingPill({
  filled,
  needed,
  unsafe = false,
  label = "staff",
}: {
  filled: number;
  needed: number;
  unsafe?: boolean;
  label?: string;
}) {
  const full = filled >= needed;
  const [tone, icon, words] =
    needed === 0
      ? [tones.neutral, "–", "none needed"]
      : unsafe
        ? [tones.bad, "!", "unsafe"]
        : full
          ? [tones.good, "✓", "filled"]
          : filled > 0
            ? [tones.warn, "!", "short"]
            : [tones.bad, "✕", "open"];
  return (
    <span className={`${chip} tabular-nums ${tone}`} title={`${filled} of ${needed} ${label} — ${words}`}>
      <span aria-hidden="true">{icon}</span>
      {filled}/{needed} {label}
      <span className="sr-only"> — {words}</span>
    </span>
  );
}
