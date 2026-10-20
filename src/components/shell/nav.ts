import type { IconName } from "../ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/roster", label: "Roster", icon: "roster" },
  { href: "/admin/events", label: "Events", icon: "calendar" },
  { href: "/admin/staff", label: "Staff", icon: "users" },
];

export const PLANNING_NAV: NavItem[] = [
  { href: "/admin/availability", label: "Availability", icon: "clock" },
  { href: "/admin/reports", label: "Reports", icon: "chart" },
];

export const SETTINGS_NAV: NavItem = { href: "/admin/settings", label: "Settings", icon: "sliders" };

export function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// "Events › New event": where the top bar says you are.
export function crumbsFor(pathname: string): { label: string; href?: string }[] {
  const all = [...PRIMARY_NAV, ...PLANNING_NAV, SETTINGS_NAV];
  const section = [...all].sort((a, b) => b.href.length - a.href.length).find((item) => isActive(item.href, pathname));
  if (!section) return [{ label: "RosterManagement" }];
  const rest = pathname.slice(section.href.length).split("/").filter(Boolean);
  if (section.href === "/admin/events" && rest.length > 0) {
    return [{ label: section.label, href: section.href }, { label: rest[0] === "new" ? "New event" : "Edit event" }];
  }
  return [{ label: section.label }];
}
