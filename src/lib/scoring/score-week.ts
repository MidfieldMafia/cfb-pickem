import type {
  Game,
  LockResult,
  Member,
  PickResult,
  Rules,
  TeamId,
  Week,
  WeekResult,
  WeeklyScore,
  WeeklyWin,
} from "./types";

function winnerOf(game: Game): TeamId | null {
  if (game.status !== "final" || game.homeScore === null || game.awayScore === null) return null;
  if (game.homeScore > game.awayScore) return game.homeTeam;
  if (game.awayScore > game.homeScore) return game.awayTeam;
  return null;
}

function combinedFinalScore(game: Game | undefined): number | null {
  if (!game || game.void || game.status !== "final" || game.homeScore === null || game.awayScore === null) {
    return null;
  }
  return game.homeScore + game.awayScore;
}

function scorePick(rules: Rules, game: Game, team: TeamId | undefined, locked: boolean): PickResult {
  if (game.void) {
    return { gameId: game.id, team: team ?? null, outcome: "void", locked: false, points: 0 };
  }
  if (team === undefined) {
    return { gameId: game.id, team: null, outcome: "unpicked", locked: false, points: 0 };
  }
  if (game.status !== "final") {
    return { gameId: game.id, team, outcome: "pending", locked, points: 0 };
  }
  const winner = winnerOf(game);
  if (winner === team) {
    const points = rules.pointsPerCorrectPick * (locked ? rules.lockMultiplier : 1);
    return { gameId: game.id, team, outcome: "correct", locked, points };
  }
  return { gameId: game.id, team, outcome: "incorrect", locked, points: 0 };
}

function scoreMember(rules: Rules, week: Week, member: Member, tiebreakerTotal: number | null): WeeklyScore {
  const lock = week.locks.find((l) => l.memberId === member.id);
  const picks: PickResult[] = week.games.map((game) => {
    const pick = week.picks.find((p) => p.memberId === member.id && p.gameId === game.id);
    return scorePick(rules, game, pick?.team, lock?.gameId === game.id);
  });
  const lockResult: LockResult | null = lock
    ? { gameId: lock.gameId, dropped: week.games.some((g) => g.id === lock.gameId && g.void) }
    : null;
  const tiebreakerGuess = week.tiebreakerGuesses.find((t) => t.memberId === member.id)?.guess ?? null;
  const tiebreakerError = tiebreakerTotal === null ? null : Math.abs((tiebreakerGuess ?? 0) - tiebreakerTotal);
  return {
    memberId: member.id,
    points: picks.reduce((sum, p) => sum + p.points, 0),
    correct: picks.filter((p) => p.outcome === "correct").length,
    incorrect: picks.filter((p) => p.outcome === "incorrect").length,
    pending: picks.filter((p) => p.outcome === "pending").length,
    picks,
    lock: lockResult,
    tiebreakerGuess,
    tiebreakerError,
  };
}

/** Points descending, then tiebreaker error ascending; unknown error sorts last. */
function compareWeekly(a: WeeklyScore, b: WeeklyScore): number {
  if (a.points !== b.points) return b.points - a.points;
  return (a.tiebreakerError ?? Infinity) - (b.tiebreakerError ?? Infinity);
}

function decideWeeklyWin(scores: WeeklyScore[]): WeeklyWin | null {
  const [top] = scores;
  if (!top) return null;
  const onPoints = scores.filter((s) => s.points === top.points);
  if (onPoints.length === 1) {
    return { winners: [top.memberId], points: top.points, decidedBy: "points" };
  }
  if (top.tiebreakerError === null) {
    return { winners: onPoints.map((s) => s.memberId), points: top.points, decidedBy: "shared" };
  }
  const closest = onPoints.filter((s) => s.tiebreakerError === top.tiebreakerError);
  return {
    winners: closest.map((s) => s.memberId),
    points: top.points,
    decidedBy: closest.length === 1 ? "tiebreaker" : "shared",
  };
}

/** A member played a week when its Deadline fell after they joined. */
export function playedWeek(member: Member, week: Week): boolean {
  return Date.parse(member.joinedAt) < Date.parse(week.deadline);
}

export function scoreWeek(rules: Rules, week: Week, members: Member[]): WeekResult {
  const tiebreakerTotal = combinedFinalScore(week.games.find((g) => g.id === week.tiebreakerGameId));
  const scores = members
    .filter((member) => playedWeek(member, week))
    .map((member) => scoreMember(rules, week, member, tiebreakerTotal))
    .sort(compareWeekly);
  const complete = week.games.every((g) => g.void || g.status === "final");
  return { weekNumber: week.weekNumber, complete, scores, weeklyWin: decideWeeklyWin(scores) };
}
