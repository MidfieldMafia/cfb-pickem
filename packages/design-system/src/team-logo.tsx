import Image from "next/image";

/** A school mark at a fixed size. Team tiles scale their own logo to fill instead.
 *  Presentational: the caller resolves the school name to a logo `src`. */
export function TeamLogo({ src, size = 24, className }: { src: string | undefined; size?: number; className?: string }) {
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
