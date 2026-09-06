import type { CfbdPollWeek } from "./types";

const POLL_PREFERENCE = ["AP Top 25", "Coaches Poll"];

/**
 * Ranks for a week come from the most recent poll published on or before it,
 * because the week's own poll is not out until the previous Saturday's games
 * are played. Prefers the AP poll, then the Coaches poll.
 */
export function rankLookup(pollWeeks: CfbdPollWeek[], week: number): Map<number, number> {
  const eligible = pollWeeks.filter((w) => w.week <= week).sort((a, b) => b.week - a.week);
  for (const pollWeek of eligible) {
    for (const name of POLL_PREFERENCE) {
      const poll = pollWeek.polls.find((p) => p.poll === name);
      if (poll) {
        return new Map(poll.ranks.filter((r) => r.rank !== null).map((r) => [r.teamId, r.rank as number]));
      }
    }
  }
  return new Map();
}
