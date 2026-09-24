// next/image needs the Next runtime (process.env.__NEXT_*), which the Artifact
// design system page does not have. Render the plain <img> the component asks for.
import * as React from "react";
// The app serves /brand/mark.svg from public/; the Artifact page has no such path, so inline it.
// @ts-expect-error -- esbuild dataurl loader
import markUrl from "../../public/brand/mark.svg";

const STATIC_ASSETS: Record<string, string> = { "/brand/mark.svg": markUrl };

type StaticImport = { src: string };

export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  priority: _priority,
  unoptimized: _unoptimized,
  quality: _quality,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  loader: _loader,
  style,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string | StaticImport;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number | string;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
}) {
  const raw = typeof src === "string" ? src : src.src;
  const url = STATIC_ASSETS[raw] ?? raw;
  const fillStyle: React.CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : undefined;
  return <img src={url} alt={alt ?? ""} width={fill ? undefined : width} height={fill ? undefined : height} style={{ ...fillStyle, ...style }} {...rest} />;
}
