// "2/3 staff": green when filled, amber when part-filled, red when empty.
export default function StaffingPill({ filled, needed }: { filled: number; needed: number }) {
  const tone =
    needed === 0
      ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      : filled >= needed
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : filled > 0
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>
      {filled}/{needed} staff
    </span>
  );
}
