import { playedWeek, scoreWeek } from "./score-week";
import type { LeaderboardRow, Member, Rules, SeasonResult, Week, WeekResult } from "./types";

function leaderboardRow(member: Member, weeks: Week[], results: WeekResult[]): LeaderboardRow {
  const played = weeks.filter((w) => playedWeek(member, w));
  const scores = results.flatMap((r) => r.scores.filter((s) => s.memberId === member.id));
  const totalPoints = scores.reduce((sum, s) => sum + s.points, 0);
  const completed = results.filter((r) => r.complete);
  const weeklyWins = completed.filter((r) => r.weeklyWin?.winners.includes(member.id)).length;
  const cumulativeTiebreakerError = completed
    .flatMap((r) => r.scores.filter((s) => s.memberId === member.id))
    .reduce((sum, s) => sum + (s.tiebreakerError ?? 0), 0);
  return {
    memberId: member.id,
    rank: 0,
    totalPoints,
    correct: scores.reduce((sum, s) => sum + s.correct, 0),
    incorrect: scores.reduce((sum, s) => sum + s.incorrect, 0),
    weeklyWins,
    weeksPlayed: played.length,
    averagePoints: played.length === 0 ? null : totalPoints / played.length,
    cumulativeTiebreakerError,
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
  const publishedWeeks = weeks.filter((w) => w.published);
  const results = publishedWeeks.map((week) => scoreWeek(rules, week, members));
  const leaderboard = rank(members.map((member) => leaderboardRow(member, publishedWeeks, results)));
  return { weeks: results, leaderboard };
}
