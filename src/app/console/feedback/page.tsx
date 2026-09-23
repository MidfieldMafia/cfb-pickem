import { Bug, Check, ChevronRight, Lightbulb } from "lucide-react";
import { db } from "@/db";
import type { FeedbackKind } from "@/db/schema";
import { Button, Card, SECTION_LABEL } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";
import { deviceLabel } from "@/lib/feedback/device";
import { listFeedback, type FeedbackItem } from "@/lib/feedback/feedback";
import { requireConsole } from "@/lib/members/current";
import { relativeTime } from "@/lib/relative-time";
import { markFeedbackAction } from "./actions";

/**
 * Feedback from members (#237), newest first. Done files an item away under a
 * collapsed section; members never see it. Commissioners only, like every
 * console screen; Organizers have no console.
 */
export default async function FeedbackScreen() {
  const commissioner = await requireConsole();
  const items = await listFeedback(db(), commissioner);
  const open = items.filter((item) => !item.doneAt);
  const done = items.filter((item) => item.doneAt);
  const now = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1>Feedback</h1>
        <p className="text-sm text-muted-foreground">
          {open.length} not done · {done.length} done
        </p>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {done.length === 0 ? "Nothing sent yet." : "Nothing new. Everything sent so far is under Done."}
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((item) => (
            <Card asChild key={item.id} className="gap-3 rounded-md p-3 md:flex-row md:items-start md:gap-4 md:p-4">
              <li>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <KindBadge kind={item.kind} />
                    <Pennant avatarId={item.member.avatarId} name={item.member.displayName} size={28} />
                    <span className="font-bold">{item.member.displayName}</span>
                    <span className="w-full text-sm text-muted-foreground md:w-auto">
                      {relativeTime(item.createdAt, now)} · {deviceLabel(item.userAgent)}
                    </span>
                  </div>
                  <p className="max-w-[64ch] whitespace-pre-line">{item.text}</p>
                </div>
                <div className="flex items-end justify-between gap-3 md:contents">
                  {item.hasScreenshot ? <Thumbnail item={item} /> : <span />}
                  <form action={markFeedbackAction} className="md:shrink-0">
                    <input type="hidden" name="feedbackId" value={item.id} />
                    <input type="hidden" name="done" value="true" />
                    <Button type="submit" variant="outline" className="h-tap">
                      <Check aria-hidden />
                      Done
                    </Button>
                  </form>
                </div>
              </li>
            </Card>
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <details className="group border-t border-border pt-2">
          <summary className={`flex min-h-tap cursor-pointer list-none items-center gap-2 ${SECTION_LABEL}`}>
            <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
            Done · {done.length}
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 rounded-md border border-settled-border bg-settled px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">{KIND_LABEL[item.kind]}</span> ·{" "}
                    {item.member.displayName} · {relativeTime(item.createdAt, now)}
                  </p>
                  <p className="truncate">{item.text}</p>
                </div>
                <form action={markFeedbackAction} className="shrink-0">
                  <input type="hidden" name="feedbackId" value={item.id} />
                  <input type="hidden" name="done" value="false" />
                  <button type="submit" className="tap inline-flex items-center px-1 text-sm font-semibold underline underline-offset-4">
                    Not done
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idea" };

/** Never colour alone: each kind carries its own icon beside its name. */
function KindBadge({ kind }: { kind: FeedbackKind }) {
  const Icon = kind === "bug" ? Bug : Lightbulb;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        kind === "bug" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
      }`}
    >
      <Icon aria-hidden className="size-3" strokeWidth={2.5} />
      {KIND_LABEL[kind]}
    </span>
  );
}

/**
 * The screenshot, opened full size in a new tab by its own commissioner-only
 * route. A plain `img`: the route is private and uncacheable, which is exactly
 * what next/image's optimiser would undo.
 */
function Thumbnail({ item }: { item: FeedbackItem }) {
  const src = `/console/feedback/${item.id}/screenshot`;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${item.member.displayName}’s screenshot full size`}
      className="block h-30 w-14 shrink-0 overflow-hidden rounded-md border border-border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-cover" />
    </a>
  );
}
