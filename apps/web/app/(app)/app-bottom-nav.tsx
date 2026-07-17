"use client";

import { BottomNav, BottomNavItem, BottomNavItemContent } from "@wakil/ui";
import { BarChart3, FolderOpen, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/new", icon: Plus, label: "إنشاء" },
  { href: "/projects", icon: FolderOpen, label: "المشاريع" },
  { href: "/usage", icon: BarChart3, label: "الاستخدام" },
  { href: "/account", icon: UserRound, label: "الحساب" },
] as const;

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <BottomNav label="التنقل الرئيسي">
      {ITEMS.map((item) => {
        const active =
          item.href === "/projects"
            ? pathname === "/projects" || pathname.startsWith("/projects/")
            : pathname === item.href;
        return (
          <BottomNavItem key={item.href} active={active}>
            <Link href={item.href}>
              <BottomNavItemContent active={active} icon={item.icon} label={item.label} />
            </Link>
          </BottomNavItem>
        );
      })}
    </BottomNav>
  );
}
