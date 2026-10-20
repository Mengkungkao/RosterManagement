"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { send } from "../admin/api";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { Spinner } from "../ui/Spinner";
import { cn } from "../ui/cn";
import { useToast } from "../ui/feedback";
import { type NavItem, PLANNING_NAV, PRIMARY_NAV, SETTINGS_NAV, crumbsFor, isActive } from "./nav";

export const SIDEBAR_COOKIE = "roster_sidebar";

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/admin" className="flex h-14 items-center gap-2.5 px-4 text-fg" aria-label="RosterManagement — dashboard">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg">
        <Icon name="roster" size={15} />
      </span>
      {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight">RosterManagement</span>}
    </Link>
  );
}

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const active = isActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-md text-sm transition-colors",
        collapsed ? "justify-center px-0" : "px-2.5",
        active ? "bg-primary-soft font-medium text-primary-text" : "text-fg-2 hover:bg-surface-3 hover:text-fg"
      )}
    >
      <Icon name={item.icon} size={17} className={active ? "" : "text-muted group-hover:text-fg-2"} />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="flex-1 truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({ collapsed, pathname, onToggle }: { collapsed: boolean; pathname: string; onToggle?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Logo collapsed={collapsed} />
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
        <p className={cn("mt-5 mb-1 px-2.5 text-[11px] font-medium tracking-wide text-subtle uppercase", collapsed && "sr-only")}>Planning</p>
        {collapsed && <div className="mx-2 my-3 border-t border-line" />}
        {PLANNING_NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
        <div className="mt-auto pt-4">
          <NavLink item={SETTINGS_NAV} pathname={pathname} collapsed={collapsed} />
        </div>
      </nav>
      {onToggle && (
        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "flex h-8 w-full items-center gap-2.5 rounded-md text-[13px] text-muted hover:bg-surface-3 hover:text-fg",
              collapsed ? "justify-center" : "px-2.5"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
          >
            <Icon name="panelLeft" size={16} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      )}
    </div>
  );
}

// The frame around every admin page: a sidebar (collapsible on desktop, a
// drawer on phones and tablets) and a top bar with where you are, a refresh,
// the alert count and the account menu.
export default function AppShell({
  children,
  initialCollapsed,
  alerts,
}: {
  children: ReactNode;
  initialCollapsed: boolean;
  alerts?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const crumbs = crumbsFor(pathname);

  // Close the phone menu after navigating.
  const [openedAt, setOpenedAt] = useState(pathname);
  if (mobileOpen && openedAt !== pathname) {
    setMobileOpen(false);
    setOpenedAt(pathname);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/admin; max-age=31536000; samesite=lax`;
  }

  async function signOut() {
    const result = await send("/api/admin/logout", "POST");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="fixed top-2 left-2 z-[70] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface transition-[width] duration-150 lg:block",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <Sidebar collapsed={collapsed} pathname={pathname} onToggle={toggle} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-pop" aria-label="Menu">
            <Sidebar collapsed={false} pathname={pathname} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-4 lg:px-6">
          <button
            type="button"
            onClick={() => {
              setOpenedAt(pathname);
              setMobileOpen(true);
            }}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-fg-2 hover:bg-surface-3 lg:hidden"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Icon name="menu" size={18} />
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-[15px]">
              {crumbs.map((c, i) => (
                <li key={c.label} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <Icon name="chevronRight" size={14} className="text-subtle" />}
                  {i === crumbs.length - 1 ? (
                    <h1 className="truncate font-semibold text-fg" aria-current="page">
                      {c.label}
                    </h1>
                  ) : (
                    <Link href={c.href!} className="truncate text-muted hover:text-fg">
                      {c.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
            aria-label="Reload from Google Sheets"
            title="Reload from Google Sheets"
          >
            {refreshing ? <Spinner size={16} /> : <Icon name="refresh" size={16} />}
          </button>
          <Link
            href="/admin#attention"
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
            aria-label={alerts ? `${alerts} item${alerts === 1 ? "" : "s"} need attention` : "Nothing needs attention"}
            title={alerts ? `${alerts} need attention` : "Nothing needs attention"}
          >
            <Icon name="bell" size={17} />
            {!!alerts && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums">
                {alerts > 99 ? "99+" : alerts}
              </span>
            )}
          </Link>
          <Menu
            label="Account"
            header="Signed in as manager"
            items={[
              { label: "Staff availability page", icon: "clock", href: "/" },
              { label: "Staff shifts page", icon: "calendar", href: "/today" },
              { label: "Sign out", icon: "logOut", onSelect: signOut, tone: "danger" },
            ]}
            trigger={(props) => (
              <button
                type="button"
                onClick={props.toggle}
                aria-expanded={props["aria-expanded"]}
                aria-haspopup={props["aria-haspopup"]}
                aria-label="Account menu"
                className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-text ring-1 ring-line hover:ring-line-strong"
              >
                <Icon name="user" size={15} />
              </button>
            )}
          />
        </header>
        <main id="main" className="flex-1 px-4 pt-5 pb-12 sm:px-5 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
