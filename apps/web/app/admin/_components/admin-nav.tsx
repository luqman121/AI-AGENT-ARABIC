"use client";

import {
  Activity,
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  ScrollText,
  ServerCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/admin", icon: LayoutDashboard, label: "نظرة عامة" },
  { href: "/admin/users", icon: Users, label: "العملاء" },
  { href: "/admin/projects", icon: FolderKanban, label: "المشاريع" },
  { href: "/admin/runs", icon: Activity, label: "عمليات التنفيذ" },
  { href: "/admin/usage", icon: BarChart3, label: "الاستخدام" },
  { href: "/admin/system", icon: ServerCog, label: "حالة النظام" },
  { href: "/admin/audit", icon: ScrollText, label: "سجل الإدارة" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="تنقّل لوحة الإدارة" className="flex gap-1 lg:flex-col">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`wk-focus-ring flex min-h-11 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm font-semibold transition-colors duration-150 ${
              active
                ? "bg-accent-subtle text-fg-accent"
                : "text-fg-2 hover:bg-overlay hover:text-fg"
            }`}
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
