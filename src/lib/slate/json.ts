/**
 * The wire shapes a screen is handed. Every screen that shows a Game, a Week,
 * a Slate or a Member takes one of these — never the Drizzle row: an explicit
 * field selection with the dates serialized at the seam. A screen can only
 * reach for what it was handed, so a column rename breaks a loader rather than
 * a page, and moving a screen to the browser is an annotation rather than a
 * rewrite.
 *
 * `cfbdGameId` is deliberately absent from `GameJson`. It is the feed's join
 * key, so the join lives here in `toSlateCandidates` instead of in a view.
 *
 * Nothing here may reach the Drizzle schema at runtime: `"use client"` files
 * import this module. `@/db/schema` is type-only, and `@/lib/results/result`
 * is db-free for the same reason.
 */
import type { Game, Member, Week } from "@/db/schema";
import type { CandidateGame } from "@/lib/cfbd/candidates";
import { effectiveResult, type GameResult } from "@/lib/results/result";
import type { Slate } from "./slate";

export interface GameJson {
  id: number;
  awayTeamId: number;
  awayTeam: string;
  awayRank: number | null;
  homeTeamId: number;
  homeTeam: string;
  homeRank: number | null;
  /** ISO 8601. `LocalTime` takes the string as it stands. */
  kickoff: string;
  spread: string | null;
}

/**
 * A Game and what happened to it. The pair the Reveal always carried, now the
 * shape every screen showing a Game takes, because the two halves were never
 * separable: whether a Game is Void, whether it has a score, and what to call
 * its state are all the result's to say. `GameJson` deliberately has no `void`
 * of its own — one spelling, `result`, everywhere.
 */
export interface GameView {
  game: GameJson;
  result: GameResult;
}

export function toGameJson(game: Game): GameJson {
  return {
    id: game.id,
    awayTeamId: game.awayTeamId,
    awayTeam: game.awayTeam,
    awayRank: game.awayRank,
    homeTeamId: game.homeTeamId,
    homeTeam: game.homeTeam,
    homeRank: game.homeRank,
    kickoff: game.kickoff.toISOString(),
    spread: game.spread,
  };
}

export function toGameView(game: Game): GameView {
  return { game: toGameJson(game), result: effectiveResult(game) };
}

/**
 * Void is the result's word for a Game that scores zero for everyone. Screens
 * ask here rather than comparing the status themselves, so the eleven places
 * that used to decide it read one answer.
 */
export function isVoid(view: GameView): boolean {
  return view.result.status === "void";
}

/** Why a Game is Void, or null when it is not. The Void's note, never the Override's. */
export function voidNote(view: GameView): string | null {
  return isVoid(view) ? view.result.note : null;
}

export interface WeekJson {
  id: number;
  weekNumber: number;
  published: boolean;
  tiebreakerGameId: number | null;
}

export function toWeekJson(week: Week): WeekJson {
  return {
    id: week.id,
    weekNumber: week.weekNumber,
    published: week.published,
    tiebreakerGameId: week.tiebreakerGameId,
  };
}

/**
 * The Slate as a screen reads it. `Slate` itself stays a server-side type: it
 * holds Drizzle rows, and the whole point of this shape is that a screen
 * cannot reach past what it names. The season is one number here, because the
 * year is all any screen says out loud; `rules` belongs to scoring.
 */
export interface SlateJson {
  week: WeekJson;
  year: number;
  games: GameView[];
  /** ISO 8601. Floating before publish, frozen after. Null until the Slate has a Game. */
  deadline: string | null;
}

export function toSlateJson(slate: Slate): SlateJson {
  return {
    week: toWeekJson(slate.week),
    year: slate.season.year,
    games: slate.games.map(toGameView),
    deadline: slate.deadline?.toISOString() ?? null,
  };
}

/** A Member as any screen names them: the chip, and nothing a screen has no business reading. */
export interface MemberJson {
  id: number;
  displayName: string;
  avatarId: string | null;
}

export function toMemberJson(member: Pick<Member, "id" | "displayName" | "avatarId">): MemberJson {
  return { id: member.id, displayName: member.displayName, avatarId: member.avatarId };
}

/** A feed candidate for the slate builder, already matched against the Slate. */
export interface SlateCandidate {
  candidate: CandidateGame;
  /** The Slate Game this candidate is already on, or null when it is not on the slate. */
  onSlate: GameJson | null;
}

/**
 * Marries the week's feed candidates to the Slate. The match is on the feed's
 * game id, which is the whole reason this is a function rather than something
 * the console does inline: the builder needs to know which candidates are
 * already on the slate without a view ever holding the join key.
 */
export function toSlateCandidates(candidates: CandidateGame[], slateGames: Game[]): SlateCandidate[] {
  const byFeedId = new Map(slateGames.map((game) => [game.cfbdGameId, game]));
  return candidates.map((candidate) => {
    const game = byFeedId.get(candidate.cfbdGameId);
    return { candidate, onSlate: game ? toGameJson(game) : null };
  });
}

/**
 * The display name of a team in a game, by CollegeFootballData team id. Takes
 * only the three fields it reads, so a database `Game` row satisfies it as
 * well as a `GameJson` and the server side needs no second copy.
 */
export function teamName(game: Pick<GameJson, "homeTeamId" | "homeTeam" | "awayTeam">, teamId: number): string {
  return teamId === game.homeTeamId ? game.homeTeam : game.awayTeam;
}
