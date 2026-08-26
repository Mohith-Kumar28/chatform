"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, KeyRound, Gauge, Users, FileStack } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Forms", icon: LayoutGrid },
  { href: "/templates", label: "Templates", icon: FileStack },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/usage", label: "Usage", icon: Gauge },
  { href: "/team", label: "Team", icon: Users },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
              active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
