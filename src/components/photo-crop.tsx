"use client";

import { ChevronLeft, Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Button, SECTION_LABEL } from "@saturday-slate/design-system";

import { clampCrop, cropBox, FIT, MAX_ZOOM, sourceSquare, type Crop, type ImageSize } from "@/lib/crop";

/** The ring's share of the stage's width; the stage's `inset-[8%]` ring matches it. */
const RING = 0.84;

/** The one size a photo pennant is stored at, and the quality the server's 100 KB cap assumes (#222). */
const OUTPUT = 216;
const QUALITY = 0.85;

const ZOOM_STEP = 0.25;

/**
 * Fit your photo (#231): the whole-page screen a chosen photo opens on, where
 * the member drags and zooms it behind a ring and gets back one finished
 * 216×216 JPEG. It covers the page rather than opening as a picker level, so
 * the welcome form's Save cannot be pressed halfway through a crop.
 *
 * The caller owns `src`, an object URL for the chosen file: it made it in the
 * change handler and revokes it when this screen closes.
 */
export function PhotoCrop({
  src,
  onCancel,
  onUse,
  onFail,
}: {
  src: string;
  onCancel: () => void;
  onUse: (jpeg: Blob) => void;
  onFail: (message: string) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [size, setSize] = useState<ImageSize | null>(null);
  const [crop, setCrop] = useState<Crop>(FIT);
  const [busy, setBusy] = useState(false);

  const move = (change: (crop: Crop) => Crop) => {
    if (size) setCrop((current) => clampCrop(size, change(current)));
  };

  /**
   * One finger pans; two pan by their midpoint and zoom by their spread. Each
   * move is measured from the last one, so a finger lifting mid-pinch just
   * carries on as a pan.
   */
  const onPointerMove = (event: React.PointerEvent) => {
    const last = pointers.current.get(event.pointerId);
    if (!last || !stage.current) return;
    const others = [...pointers.current].filter(([id]) => id !== event.pointerId).map(([, at]) => at);
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const ringPx = stage.current.getBoundingClientRect().width * RING;
    if (others.length === 0) {
      move((c) => ({ ...c, x: c.x + (next.x - last.x) / ringPx, y: c.y + (next.y - last.y) / ringPx }));
      return;
    }
    const other = others[0];
    const spread = Math.hypot(next.x - other.x, next.y - other.y) / Math.hypot(last.x - other.x, last.y - other.y);
    move((c) => ({
      zoom: c.zoom * (Number.isFinite(spread) ? spread : 1),
      x: c.x + (next.x - last.x) / 2 / ringPx,
      y: c.y + (next.y - last.y) / 2 / ringPx,
    }));
  };

  const release = (event: React.PointerEvent) => pointers.current.delete(event.pointerId);

  async function use() {
    if (!image.current || !size) return;
    setBusy(true);
    try {
      onUse(await toJpeg(image.current, sourceSquare(size, crop)));
    } catch {
      setBusy(false);
      onFail("That photo couldn’t be cropped. Choose another.");
    }
  }

  const box = size ? cropBox(size, crop) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-crop-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-foreground"
    >
      {/* Fixed over the page, it escapes body's safe-area padding, so it carries its own:
          the clock sits over the top edge and the home indicator over the bottom one. */}
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="flex h-14 items-center">
          <button type="button" onClick={onCancel} className="-ml-2 flex items-center gap-1 px-2 font-semibold">
            <ChevronLeft aria-hidden className="size-5" />
            Cancel
          </button>
        </div>
        <div className="space-y-1 text-center">
          <h2 id="photo-crop-title" className="font-display text-[28px] leading-8">
            Fit your photo
          </h2>
          <p className="text-sm text-muted-foreground">Drag to move it. Pinch or use the slider to zoom.</p>
        </div>

        <div
          ref={stage}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-xl bg-foreground select-none"
        >
          {/* A blob: URL the browser decodes in place; next/image has nothing to optimise here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={image}
            src={src}
            alt="Your photo"
            draggable={false}
            onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => onFail("That photo couldn’t be opened. Choose another.")}
            className="pointer-events-none absolute max-w-none"
            style={box ? placed(box, RING) : { visibility: "hidden" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[8%] rounded-full border-2 border-card/90 shadow-[0_0_0_100vmax_color-mix(in_srgb,var(--foreground)_62%,transparent)]"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => move((c) => ({ ...c, zoom: c.zoom - ZOOM_STEP }))}
            className="flex size-tap items-center justify-center"
          >
            <Minus aria-hidden className="size-5" />
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(event) => move((c) => ({ ...c, zoom: Number(event.target.value) }))}
            className="min-w-0 flex-1 accent-primary"
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => move((c) => ({ ...c, zoom: c.zoom + ZOOM_STEP }))}
            className="flex size-tap items-center justify-center"
          >
            <Plus aria-hidden className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span className={SECTION_LABEL}>How it looks</span>
          {[72, 44, 28].map((disc) => (
            <span key={disc} className="relative shrink-0 overflow-hidden rounded-full" style={{ width: disc, height: disc }}>
              {box ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="absolute max-w-none" style={placed(box, 1)} />
              ) : null}
            </span>
          ))}
        </div>

        <Button type="button" size="lg" className="mt-auto h-tap w-full" disabled={!size || busy} onClick={use}>
          {busy ? "Cropping…" : "Use this photo"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The photo's box as percentages of its container, when the ring spans `ring`
 * of that container's width and sits centred in it.
 */
function placed(box: ReturnType<typeof cropBox>, ring: number): React.CSSProperties {
  const margin = (1 - ring) / 2;
  const pct = (n: number) => `${n * 100}%`;
  return {
    left: pct(margin + box.left * ring),
    top: pct(margin + box.top * ring),
    width: pct(box.width * ring),
    height: pct(box.height * ring),
  };
}

/**
 * The square the ring covers, drawn down to 216×216 and encoded as JPEG. A
 * camera photo is ~4000px across, and one straight draw down to 216 skips most
 * of its pixels and shimmers; halving first keeps every step a gentle one.
 */
async function toJpeg(image: HTMLImageElement, square: { x: number; y: number; side: number }): Promise<Blob> {
  let source: CanvasImageSource = image;
  let { x, y, side } = square;
  while (side > OUTPUT * 2) {
    const half = Math.round(side / 2);
    source = draw(source, x, y, side, half);
    x = 0;
    y = 0;
    side = half;
  }
  const canvas = draw(source, x, y, side, OUTPUT);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob gave nothing back"))), "image/jpeg", QUALITY),
  );
}

function draw(source: CanvasImageSource, x: number, y: number, side: number, to: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = to;
  canvas.height = to;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, x, y, side, side, 0, 0, to, to);
  return canvas;
}
