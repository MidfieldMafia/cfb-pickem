import type {
  Game,
  GameId,
  LockResult,
  Member,
  MemberId,
  PickResult,
  Rules,
  TeamId,
  Week,
  WeekResult,
  WeeklyScore,
  WeeklyWin,
} from "./types";

/** Both final scores, or null when the game has not finished with a score on each side. */
function finalScores(game: Game): { home: number; away: number } | null {
  if (game.status !== "final" || game.homeScore === null || game.awayScore === null) return null;
  return { home: game.homeScore, away: game.awayScore };
}

function winnerOf(game: Game): TeamId | null {
  const scores = finalScores(game);
  if (scores === null) return null;
  if (scores.home > scores.away) return game.homeTeam;
  if (scores.away > scores.home) return game.awayTeam;
  return null;
}

function combinedFinalScore(game: Game | undefined): number | null {
  if (!game || game.void) return null;
  const scores = finalScores(game);
  return scores === null ? null : scores.home + scores.away;
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

/**
 * Picks, locks and guesses indexed by member once per week, so scoring a member
 * is a lookup rather than a scan of every other member's rows.
 */
interface WeekIndex {
  picks: Map<string, TeamId>;
  locks: Map<MemberId, GameId>;
  guesses: Map<MemberId, number>;
  voidGameIds: Set<GameId>;
}

function indexWeek(week: Week): WeekIndex {
  return {
    picks: new Map(week.picks.map((p) => [`${p.memberId}:${p.gameId}`, p.team])),
    locks: new Map(week.locks.map((l) => [l.memberId, l.gameId])),
    guesses: new Map(week.tiebreakerGuesses.map((t) => [t.memberId, t.guess])),
    voidGameIds: new Set(week.games.filter((g) => g.void).map((g) => g.id)),
  };
}

function scoreMember(
  rules: Rules,
  week: Week,
  index: WeekIndex,
  member: Member,
  tiebreakerTotal: number | null,
): WeeklyScore {
  const lockGameId = index.locks.get(member.id);
  const picks: PickResult[] = week.games.map((game) => {
    const team = index.picks.get(`${member.id}:${game.id}`);
    return scorePick(rules, game, team, lockGameId === game.id);
  });
  const lockResult: LockResult | null =
    lockGameId === undefined
      ? null
      : { gameId: lockGameId, dropped: index.voidGameIds.has(lockGameId) };
  const tiebreakerGuess = index.guesses.get(member.id) ?? null;
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
function playedWeek(member: Member, week: Week): boolean {
  return Date.parse(member.joinedAt) < Date.parse(week.deadline);
}

export function scoreWeek(rules: Rules, week: Week, members: Member[]): WeekResult {
  const tiebreakerTotal = combinedFinalScore(week.games.find((g) => g.id === week.tiebreakerGameId));
  const index = indexWeek(week);
  const scores = members
    .filter((member) => playedWeek(member, week))
    .map((member) => scoreMember(rules, week, index, member, tiebreakerTotal))
    .sort(compareWeekly);
  const complete = week.games.every((g) => g.void || g.status === "final");
  return { weekNumber: week.weekNumber, complete, scores, weeklyWin: decideWeeklyWin(scores) };
}
