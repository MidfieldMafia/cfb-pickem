import { scoreWeek } from "./score-week";
import type {
  LeaderboardRow,
  Member,
  MemberId,
  Rules,
  SeasonResult,
  Week,
  WeekResult,
  WeeklyScore,
} from "./types";

/**
 * One member's score for one week, tagged with what the season needs to know
 * about that week. `complete` and `won` are read off the WeekResult once here
 * rather than re-derived per member while building the Leaderboard.
 */
interface SeasonScore {
  score: WeeklyScore;
  /** Every non-void game was final: the week counts toward Weekly Wins and tiebreaker error. */
  complete: boolean;
  won: boolean;
}

/**
 * Every member's weeks gathered in one pass, so a Leaderboard row is a lookup
 * rather than a scan of every week's scores for every member.
 */
function seasonScores(results: WeekResult[]): Map<MemberId, SeasonScore[]> {
  const byMember = new Map<MemberId, SeasonScore[]>();
  for (const result of results) {
    const winners = new Set(result.weeklyWin?.winners);
    for (const score of result.scores) {
      const entry: SeasonScore = {
        score,
        complete: result.complete,
        won: result.complete && winners.has(score.memberId),
      };
      const bucket = byMember.get(score.memberId);
      if (bucket) bucket.push(entry);
      else byMember.set(score.memberId, [entry]);
    }
  }
  return byMember;
}

/**
 * `scoreWeek` emits one score per member per week they played, so the member's
 * own entries are the weeks they played — the rule is not re-applied here.
 */
function leaderboardRow(member: Member, entries: SeasonScore[]): LeaderboardRow {
  const totalPoints = entries.reduce((sum, e) => sum + e.score.points, 0);
  const completed = entries.filter((e) => e.complete);
  return {
    memberId: member.id,
    rank: 0,
    totalPoints,
    correct: entries.reduce((sum, e) => sum + e.score.correct, 0),
    incorrect: entries.reduce((sum, e) => sum + e.score.incorrect, 0),
    weeklyWins: entries.filter((e) => e.won).length,
    weeksPlayed: entries.length,
    averagePoints: entries.length === 0 ? null : totalPoints / entries.length,
    cumulativeTiebreakerError: completed.reduce((sum, e) => sum + (e.score.tiebreakerError ?? 0), 0),
  };
}

/** Season tiebreak order: total points, then weekly wins, then lowest cumulative tiebreaker error. */
function compareSeason(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  if (a.weeklyWins !== b.weeklyWins) return b.weeklyWins - a.weeklyWins;
  return a.cumulativeTiebreakerError - b.cumulativeTiebreakerError;
}

/** Assign 1-based ranks; rows that tie on every tiebreak share a rank and the next rank is skipped. */
function rank(rows: LeaderboardRow[]): LeaderboardRow[] {
  const sorted = [...rows].sort(compareSeason);
  const ranked: LeaderboardRow[] = [];
  sorted.forEach((row, i) => {
    const previous = ranked[i - 1];
    const tied = previous !== undefined && compareSeason(previous, row) === 0;
    ranked.push({ ...row, rank: tied ? previous.rank : i + 1 });
  });
  return ranked;
}

export function scoreSeason(rules: Rules, weeks: Week[], members: Member[]): SeasonResult {
  const results = weeks.filter((w) => w.published).map((week) => scoreWeek(rules, week, members));
  const byMember = seasonScores(results);
  const leaderboard = rank(
    members.map((member) => leaderboardRow(member, byMember.get(member.id) ?? [])),
  );
  return { weeks: results, leaderboard };
}
