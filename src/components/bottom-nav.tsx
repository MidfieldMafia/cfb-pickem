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

/**
 * The four tabs of the phone app — three for a member who is not a
 * commissioner, since the console answers everyone else with a 404 and a tab
 * that 404s is worse than no tab. Sticky, so the tabs stay under the thumb
 * while a long Live Board scrolls.
 */
export function BottomNav({ commissioner }: { commissioner: boolean }) {
  const pathname = usePathname();
  const tabs = commissioner ? TABS : TABS.filter((tab) => tab.href !== "/console");
  return (
    <nav
      aria-label="App"
      className={`sticky bottom-0 z-10 grid border-t border-border bg-card pb-2 ${commissioner ? "grid-cols-4" : "grid-cols-3"}`}
    >
      {tabs.map(({ href, label, Icon }) => {
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
