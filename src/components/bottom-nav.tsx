"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Radio, Shield, Trophy } from "lucide-react";

const TABS = [
  { href: "/picks", label: "Picks", Icon: ClipboardCheck },
  { href: "/live", label: "Live Board", Icon: Radio },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/console", label: "Commissioner", Icon: Shield },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="grid grid-cols-4 border-t border-border bg-card pb-2">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-14 flex-col items-center justify-center gap-1 p-1.5 text-[11px] font-bold no-underline"
          >
            <span
              className={`grid h-7 w-14 place-items-center rounded-full ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon size={18} />
            </span>
            <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
