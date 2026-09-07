"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, ListPlus, Pencil, Smartphone, Users } from "lucide-react";

const LINKS = [
  { href: "/console/slate", label: "Slate builder", Icon: ListPlus },
  { href: "/console/members", label: "Members", Icon: Users },
  { href: "/console/picks", label: "Who hasn't picked", Icon: ClipboardCheck },
  { href: "/console/results", label: "Result overrides", Icon: Pencil },
] as const;

/** The rail's row: icon, label, and the pine fill when it is the screen you are on. */
const ITEM = "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold whitespace-nowrap no-underline";

export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2 md:w-56 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:py-4">
      {LINKS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${ITEM} ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            <Icon size={20} aria-hidden />
            {label}
          </Link>
        );
      })}
      <Link href="/week" className={`${ITEM} text-muted-foreground hover:bg-accent md:mt-auto`}>
        <Smartphone size={20} aria-hidden />
        Open the app
      </Link>
    </nav>
  );
}
