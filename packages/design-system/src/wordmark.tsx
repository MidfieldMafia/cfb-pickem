import Image from "next/image";
import Link from "next/link";

export function Wordmark({ href = "/", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const mark = size === "lg" ? 56 : 36;
  return (
    <Link href={href} className="inline-flex items-center gap-3 no-underline">
      <Image src="/brand/mark.svg" alt="" width={mark} height={mark} priority unoptimized />
      <span
        className={`font-display text-foreground tracking-wide uppercase border-b-[3px] border-secondary ${
          size === "lg" ? "text-2xl" : "text-lg"
        }`}
      >
        Saturday Slate
      </span>
    </Link>
  );
}
