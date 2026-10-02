/**
 * Whether the field parser could read a game's feed: which teams its spots
 * never placed, and how many runs and catches fell back to a jump. A new
 * spelling of a spot fails silently, drawing jumps and never an error (#331),
 * so `npm run check-field` runs this over a Saturday's stored feeds.
 */
import type { CfbdLivePlay } from "@/lib/cfbd/types";
import { abbreviations, describePlays, sideOf, type FieldTeams, type Side } from "./field";

/** How many jump-only play texts a check keeps, to show the spelling that failed. */
const SAMPLES = 3;

export interface FieldCheck {
  /** The sides no abbreviation in the feed was placed for. */
  unplaced: Side[];
  runsAndCatches: number;
  /** Runs and catches whose only line on the field is a jump. */
  jumpOnly: number;
  /** The first few of those plays' texts. */
  samples: string[];
}

export function checkField(plays: readonly CfbdLivePlay[], teams: FieldTeams): FieldCheck {
  const placed = new Set(abbreviations(plays, sideOf(teams)).values());
  const described = describePlays(plays, teams);
  let runsAndCatches = 0;
  const jumps: string[] = [];
  plays.forEach((play, i) => {
    if (!/^(Rush|Pass Reception)$/.test(play.playType)) return;
    runsAndCatches++;
    const lines = described[i].segments.filter((s) => s.kind === "ground" || s.kind === "arc" || s.kind === "jump");
    if (lines.length > 0 && lines.every((s) => s.kind === "jump")) jumps.push(play.playText);
  });
  return {
    unplaced: plays.length === 0 ? [] : (["home", "away"] as const).filter((side) => !placed.has(side)),
    runsAndCatches,
    jumpOnly: jumps.length,
    samples: jumps.slice(0, SAMPLES),
  };
}
