"use client";

import Link from "next/link";
import { Share, Trophy } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { Button, CopyButton } from "@saturday-slate/design-system";
import { Pennant } from "@/components/pennant";
import { shareText, shareWin } from "@/lib/champion/share";
import type { ScoredMember } from "@/lib/results/json";
import { championLabel, championSentence, listNames } from "@/lib/results/summary";

/** Where See the Leaderboard and the shared link go: the Season board, where the champion card is. */
const LEADERBOARD = "/leaderboard?week=season";

/** Web Share exists in this browser. Never on the server, where the sheet is closed anyway. */
const canShare = () => typeof navigator.share === "function";
const noSubscription = () => () => {};

/**
 * The Regular Season Champion's celebration sheet (#592, design B of #587,
 * "the program page", larger): a bottom sheet the `(member)` layout mounts
 * once Week 13 is settled, for every member who has not seen it. Closing it
 * any way — Close, the scrim, Escape, See the Leaderboard — fires `onSeen`
 * once, which records it for this group and season.
 *
 * Share your win is the champion's alone: everyone else's sheet just says who
 * won. Without Web Share, or when the share call fails for any reason other
 * than the member dismissing the picker, it is a copy of the same text.
 */
export function ChampionSheet({
  year,
  champions,
  points,
  viewerIsChampion,
  onSeen,
}: {
  year: number;
  champions: ScoredMember[];
  points: number;
  viewerIsChampion: boolean;
  onSeen: () => void | Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const seen = useRef(false);
  const shareable = useSyncExternalStore(noSubscription, canShare, () => false);
  const [shareFailed, setShareFailed] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const close = () => dialog.current?.close();
  const markSeen = () => {
    if (seen.current) return;
    seen.current = true;
    Promise.resolve(onSeen()).catch(() => {});
  };
  // A click that lands on the dialog itself, outside the sheet, is on the scrim.
  const onScrim = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const text = shareText({ year, points, co: champions.length > 1 });
  const share = async () => {
    const url = new URL(LEADERBOARD, window.location.origin).href;
    const outcome = await shareWin((data) => navigator.share(data), { title: championLabel(champions), text, url });
    if (outcome === "failed") setShareFailed(true);
  };

  return (
    <dialog
      ref={dialog}
      aria-label={championSentence(champions)}
      onClose={markSeen}
      onClick={onScrim}
      className="mx-auto mt-auto mb-0 w-full max-w-md overflow-hidden rounded-t-[14px] border-t border-border bg-popover p-0 text-popover-foreground backdrop:bg-foreground/50"
    >
      <div className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <span aria-hidden className="mt-3 h-1 w-12 self-center rounded-full bg-muted" />
        <div className="mx-4 mt-4 flex flex-col items-center gap-1.5 border-y-[3px] border-double border-secondary px-4 py-5 text-center">
          <Trophy size={32} className="text-secondary" aria-hidden />
          <p className="text-xs leading-4 font-bold tracking-[0.08em] text-secondary uppercase">Saturday Slate · {year}</p>
          <h2 className="font-display text-[32px] leading-9 font-black text-balance">{championLabel(champions)}</h2>
          <div className="flex gap-2">
            {champions.map((m) => (
              <Pennant key={m.id} avatarId={m.avatarId} name={m.displayName} size={72} />
            ))}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {listNames(champions)} · {points} points
          </p>
        </div>
        <div className="flex flex-col gap-2 p-4 pt-6">
          <Button asChild size="lg" className="w-full">
            <Link href={LEADERBOARD} onClick={close}>
              See the Leaderboard
            </Link>
          </Button>
          {viewerIsChampion ? (
            shareable && !shareFailed ? (
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={share}>
                <Share aria-hidden />
                Share your win
              </Button>
            ) : (
              <CopyButton text={text} label="Copy your win" size="default" className="w-full" />
            )
          ) : null}
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={close}>
            Close
          </Button>
        </div>
      </div>
    </dialog>
  );
}
