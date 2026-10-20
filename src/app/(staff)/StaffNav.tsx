"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const LINKS = [
  { href: "/", label: "Availability" },
  { href: "/today", label: "My shifts" },
];

export default function StaffNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Staff" className="ml-auto flex items-center gap-1 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname === l.href ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1.5 font-medium",
            pathname === l.href ? "bg-primary-soft text-primary-text" : "text-muted hover:bg-surface-3 hover:text-fg"
          )}
        >
          {l.label}
        </Link>
      ))}
      <Link href="/admin" className="ml-1 rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-3 hover:text-fg">
        Manager
      </Link>
    </nav>
  );
}
