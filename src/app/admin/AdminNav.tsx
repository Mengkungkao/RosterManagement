"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/admin", label: "Availability" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/roster", label: "Roster Match" },
];

export default function AdminNav({ right }: { right?: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="mt-4 flex flex-wrap items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
      {right && (
        <div className="ml-auto flex flex-wrap items-center gap-3 pb-2 text-sm">{right}</div>
      )}
    </nav>
  );
}
