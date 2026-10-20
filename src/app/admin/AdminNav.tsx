"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Roster" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/wages", label: "Wages" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
