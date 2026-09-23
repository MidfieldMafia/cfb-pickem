"use client";

import { Bug, CircleCheck, ImageIcon, Lightbulb } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Card, SECTION_LABEL } from "@saturday-slate/design-system";

import {
  MAX_FEEDBACK_TEXT,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_LONG_EDGE,
  type FeedbackState,
} from "@/lib/feedback/limits";
import { track } from "@/lib/analytics/analytics";
import { sendFeedbackAction } from "./actions";

type Kind = "" | "bug" | "idea";

interface Screenshot {
  jpeg: Blob;
  url: string;
}

const PLACEHOLDER = {
  "": "What happened, and what did you expect?",
  bug: "What happened, and what did you expect?",
  idea: "What would you like the app to do?",
};

/**
 * The Send feedback form (#237). A member refused at the daily limit should
 * not lose what they wrote, so the form is submitted by hand rather than
 * through `action`: React resets a form after its action, and the reset
 * unchecks a controlled radio without React noticing, so Bug or Idea would
 * look chosen in state and post as neither. The screenshot is shrunk here to
 * a JPEG, held in state, and joins the `FormData` when it is built, the way
 * the pennant picker's photo does.
 */
export function FeedbackForm() {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedbackAction, {});
  const [kind, setKind] = useState<Kind>("");
  const [text, setText] = useState("");
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<number | undefined>();
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = form.current;
    if (!element || !shot) return;
    const attach = (event: FormDataEvent) => event.formData.set("screenshot", shot.jpeg, "screenshot.jpg");
    element.addEventListener("formdata", attach);
    return () => element.removeEventListener("formdata", attach);
  }, [shot]);

  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

  // `sent` is the new row's id, so each send changes it exactly once.
  useEffect(() => {
    if (state.sent !== undefined) track("feedback_sent");
  }, [state.sent]);

  if (state.sent !== undefined && state.sent !== dismissed) {
    return (
      <Card className="gap-3 p-4">
        <div className="flex items-center gap-3">
          <CircleCheck aria-hidden className="size-7 shrink-0 text-primary" />
          <p role="status" className="text-lg font-bold">
            Thanks, sent to the commissioners.
          </p>
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => {
              setKind("");
              setText("");
              setShot(null);
              setShotError(null);
              setDismissed(state.sent);
            }}
            className={QUIET_LINK}
          >
            Send another
          </button>
          <Link href="/you" className={QUIET_LINK}>
            Back to You
          </Link>
        </div>
      </Card>
    );
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setShotError(null);
    try {
      const jpeg = await shrink(file);
      if (jpeg.size > MAX_SCREENSHOT_BYTES) throw new Error("still too large");
      setShot({ jpeg, url: URL.createObjectURL(jpeg) });
    } catch {
      setShotError("That picture couldn’t be used. Choose another.");
    }
  }

  const error = shotError ?? state.error;

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-1 flex-col gap-5"
    >
      <fieldset className="min-w-0 space-y-2">
        <legend className={`mb-2 ${SECTION_LABEL}`}>What is it?</legend>
        <div className="grid grid-cols-2 gap-2">
          <KindTile value="bug" kind={kind} onPick={setKind} icon={<Bug aria-hidden className="size-[18px]" />} title="Bug">
            Something&rsquo;s broken
          </KindTile>
          <KindTile
            value="idea"
            kind={kind}
            onPick={setKind}
            icon={<Lightbulb aria-hidden className="size-[18px]" />}
            title="Idea"
          >
            Something you&rsquo;d like
          </KindTile>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="feedback-text" className={SECTION_LABEL}>
          In your words
        </label>
        <textarea
          id="feedback-text"
          name="text"
          rows={6}
          required
          maxLength={MAX_FEEDBACK_TEXT}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDER[kind]}
          className="min-h-37 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p className="self-end text-xs text-muted-foreground">
          {text.length} / {MAX_FEEDBACK_TEXT}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className={SECTION_LABEL}>
          Screenshot <span className="font-semibold tracking-normal normal-case text-muted-foreground">(optional)</span>
        </p>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {shot ? (
          <div className="flex items-center gap-3">
            {/* A blob: URL the browser decodes in place; next/image has nothing to optimise here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.url}
              alt="Your screenshot"
              className="h-26 w-12 rounded-md border border-border object-cover"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Screenshot added</span>
              <button type="button" onClick={() => setShot(null)} className={`self-start ${QUIET_LINK}`}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" className="h-tap self-start" onClick={() => picker.current?.click()}>
            <ImageIcon aria-hidden />
            Add a screenshot
          </Button>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-tap w-full" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

const QUIET_LINK =
  "tap inline-flex items-center text-sm font-semibold underline underline-offset-4";

/**
 * One of the two kinds, as a tile: a real radio inside a label, so the whole
 * tile is the target and the browser's `required` asks before the server does.
 */
function KindTile({
  value,
  kind,
  onPick,
  icon,
  title,
  children,
}: {
  value: "bug" | "idea";
  kind: Kind;
  onPick: (kind: Kind) => void;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card p-3 has-checked:border-2 has-checked:border-primary has-checked:bg-accent has-checked:p-[11px]">
      <input
        type="radio"
        name="kind"
        value={value}
        required
        checked={kind === value}
        onChange={() => onPick(value)}
        className="mt-1 size-[18px] min-h-0 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 font-bold">
          {icon}
          {title}
        </span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

/**
 * The picture drawn down so its long edge is at most `SCREENSHOT_LONG_EDGE`,
 * as JPEG. Not WebP: iOS canvas falls back to PNG for it. A phone screenshot
 * is already about that size, so this is mostly re-encoding a PNG as JPEG.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SCREENSHOT_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob gave nothing back"))), "image/jpeg", 0.85),
  );
}
