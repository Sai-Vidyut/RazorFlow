import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import {
  ChartLineUp,
  ClipboardText,
  CreditCard,
  Gauge,
  ListBullets,
  Package,
  ShieldCheck,
  Stack,
  Storefront,
  ArrowsClockwise,
  Users,
} from "@phosphor-icons/react";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const PUBLIC_NAV: NavItem[] = [
  { href: "/desk", label: "Desk", icon: Storefront, exact: true },
  { href: "/policies", label: "Policies", icon: ShieldCheck, exact: true },
  { href: "/admin", label: "Admin", icon: Gauge, exact: true },
];

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [{ href: "/desk", label: "Desk", icon: Storefront, exact: true }],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin", label: "Overview", icon: Gauge, exact: true },
      { href: "/admin/orders", label: "Orders", icon: ClipboardText },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/recovery", label: "Recovery", icon: ArrowsClockwise },
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/inventory", label: "Inventory", icon: Stack },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/admin/policies", label: "Policies", icon: ShieldCheck },
      { href: "/admin/staff", label: "Staff", icon: Users },
      { href: "/admin/activity", label: "Activity", icon: ListBullets },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: "/admin/insights", label: "Insights", icon: ChartLineUp }],
  },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ClipboardText },
  { href: "/desk", label: "Desk", icon: Storefront, exact: true },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/insights", label: "Insights", icon: ChartLineUp },
];

export function titleForPath(pathname: string): string {
  if (pathname === "/admin") return "Overview";
  if (pathname.startsWith("/admin/orders")) return "Orders";
  if (pathname.startsWith("/admin/payments")) return "Payments";
  if (pathname.startsWith("/admin/recovery")) return "Recovery";
  if (pathname.startsWith("/admin/products")) return "Products";
  if (pathname.startsWith("/admin/inventory")) return "Inventory";
  if (pathname.startsWith("/admin/policies")) return "Policies";
  if (pathname.startsWith("/admin/staff")) return "Staff";
  if (pathname.startsWith("/admin/activity")) return "Activity";
  if (pathname.startsWith("/admin/insights")) return "Insights";
  return "Admin";
}
