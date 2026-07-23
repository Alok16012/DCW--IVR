import type { Role } from "@/lib/status";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide icon name
  roles: Role[];
  badgeKey?: "callbacks" | "calls";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", roles: ["super_admin", "manager", "agent", "auditor"] },
  { href: "/calls", label: "All calls", icon: "Waypoints", roles: ["super_admin", "manager", "agent", "auditor"], badgeKey: "calls" },
  { href: "/agents", label: "Agents", icon: "Users", roles: ["super_admin", "manager", "auditor"] },
  { href: "/routing", label: "Routing", icon: "GitBranch", roles: ["super_admin", "manager"] },
  { href: "/callbacks", label: "Callbacks", icon: "PhoneOutgoing", roles: ["super_admin", "manager", "agent"], badgeKey: "callbacks" },
  { href: "/reports", label: "Reports", icon: "BarChart3", roles: ["super_admin", "manager", "auditor"] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ["super_admin"] },
  { href: "/audit", label: "Audit logs", icon: "ScrollText", roles: ["super_admin", "manager", "auditor"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
