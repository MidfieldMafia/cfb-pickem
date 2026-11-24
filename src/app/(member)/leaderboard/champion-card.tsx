import { Trophy } from "lucide-react";
import { Pennant } from "@/components/pennant";
import { plural } from "@/lib/plural";
import type { RegularSeasonChampion } from "@/lib/results/json";
import { championLabel, championSentence, listNames } from "@/lib/results/summary";

/**
 * The Regular Season Champion at the top of the Season board (#589, design B
 * of #587, "the program page"): paper ruled top and bottom in the rivalry
 * titles' rust double rule, a trophy, the title, each champion's Pennant, the
 * name in Chivo and the points. Co-champions share the one card.
 *
 * "Corrected" is the one line ever added under the points: a Result Override
 * standing over a feed's final is what crowned them (`SeasonResult.champion`).
 */
export function ChampionCard({ champion }: { champion: RegularSeasonChampion }) {
  const { members, points, corrected } = champion;
  return (
    <section
      aria-label={championSentence(members)}
      className="flex flex-col items-center gap-1 border-y-[3px] border-double border-secondary bg-card p-3 text-center"
    >
      <Trophy size={22} className="text-secondary" aria-hidden />
      <p className="text-xs leading-4 font-bold tracking-[0.08em] text-secondary uppercase">{championLabel(members)}</p>
      <div className="flex gap-2">
        {members.map((m) => (
          <Pennant key={m.id} avatarId={m.avatarId} name={m.displayName} size={56} />
        ))}
      </div>
      <p className="font-display text-[30px] leading-[34px] font-black text-balance">{listNames(members)}</p>
      <p className="text-sm text-muted-foreground tabular-nums">{plural(points, "point")}</p>
      {corrected ? <p className="text-xs text-muted-foreground">Corrected</p> : null}
    </section>
  );
}
