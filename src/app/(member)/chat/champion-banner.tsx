import Link from "next/link";
import { Trophy } from "lucide-react";
import type { RegularSeasonChampion } from "@/lib/results/json";
import { championLabel, championSentence, listNames } from "@/lib/results/summary";

/**
 * The Regular Season Champion pinned at the top of Chat (#589, design B of
 * #587): one compact paper row in the champion card's rust double rule, the
 * trophy at the left edge and the title and name centred across the full
 * width. A tap opens the Season board, where the card is.
 */
export function ChampionBanner({ champion }: { champion: RegularSeasonChampion }) {
  const { members } = champion;
  return (
    <Link
      href="/leaderboard?week=season"
      aria-label={`${championSentence(members)}. See the Leaderboard`}
      className="relative flex min-h-14 items-center justify-center border-y-[3px] border-double border-secondary bg-card px-10 py-2 text-center text-foreground no-underline"
    >
      <Trophy size={20} className="absolute top-1/2 left-3 -translate-y-1/2 text-secondary" aria-hidden />
      <span className="flex min-w-0 flex-col items-center">
        <span className="text-xs leading-4 font-bold tracking-[0.08em] text-secondary uppercase">{championLabel(members)}</span>
        <span className="font-display text-xl leading-6 font-black">{listNames(members)}</span>
      </span>
    </Link>
  );
}
