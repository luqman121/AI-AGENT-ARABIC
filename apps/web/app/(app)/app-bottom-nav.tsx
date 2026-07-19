"use client";

import { BottomNav, BottomNavItem, BottomNavItemContent } from "@wakil/ui";
import { FolderOpen, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// "إنشاء" stays the center item regardless of DOM order under RTL.
const ITEMS = [
  { href: "/projects", icon: FolderOpen, label: "المشاريع" },
  { href: "/new", icon: Plus, label: "إنشاء" },
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
