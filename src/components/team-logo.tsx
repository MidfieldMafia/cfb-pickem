import Image from "next/image";
import { logoSrc } from "@/lib/logos";

/** A school mark at a fixed size. Team tiles scale their own logo to fill instead. */
export function TeamLogo({ team, size = 24, className }: { team: string; size?: number; className?: string }) {
  const src = logoSrc(team);
  if (!src) return <span aria-hidden className="shrink-0" style={{ width: size, height: size }} />;
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 object-contain ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}
