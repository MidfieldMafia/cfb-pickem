"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/console/slate", label: "Slate builder" },
  { href: "/console/members", label: "Members" },
];

export function ConsoleNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border px-4 py-2 md:w-56 md:flex-col md:border-b-0 md:border-r md:py-4">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-sm font-semibold no-underline ${
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <Link href="/week" className="rounded-md px-3 py-2 text-sm font-semibold no-underline md:mt-auto">
        Open the app
      </Link>
    </nav>
  );
}
