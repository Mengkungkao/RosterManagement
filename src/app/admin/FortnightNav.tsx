import Link from "next/link";
import { addDays, formatDateRange } from "@/lib/dates";
import { secondaryButton } from "../ui";

// ‹ 12 Oct – 25 Oct 2026 › — links to the same page for the previous/next fortnight.
export default function FortnightNav({
  basePath,
  fortnightStart,
  currentFortnight,
}: {
  basePath: string;
  fortnightStart: string;
  currentFortnight: string;
}) {
  const href = (start: string) => `${basePath}?fortnight=${start}`;
  const arrow = `${secondaryButton} px-2.5`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href(addDays(fortnightStart, -14))} className={arrow} aria-label="Previous fortnight">
        ‹
      </Link>
      <span className="min-w-44 text-center text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-50">
        {formatDateRange(fortnightStart, addDays(fortnightStart, 13))}
      </span>
      <Link href={href(addDays(fortnightStart, 14))} className={arrow} aria-label="Next fortnight">
        ›
      </Link>
      {fortnightStart !== currentFortnight && (
        <Link href={href(currentFortnight)} className={secondaryButton}>
          This fortnight
        </Link>
      )}
    </div>
  );
}
