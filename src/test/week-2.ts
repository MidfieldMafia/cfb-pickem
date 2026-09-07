/**
 * The recorded 2026 Week 2 feed, which every server-seam test builds on. The
 * game ids live here rather than in each test file, so re-recording the fixture
 * is one edit and the names cannot drift from the games they point at.
 */
import { eq } from "drizzle-orm";
import { members, seasons } from "@/db/schema";
import type { Db } from "@/db/types";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { recordedCfbd, recordings, scoreboardOf } from "@/lib/cfbd/recorded";
import type { RainChanceSource } from "@/lib/weather/open-meteo";
import { recordedOpenMeteo } from "@/lib/weather/recorded";
import type { CfbdClient, CfbdGame, CfbdScoreboardGame } from "@/lib/cfbd/types";
import { asMember } from "@/lib/members/authority";
import { addMember, bootstrapCommissioner } from "@/lib/members/members";
import { applyEdit } from "@/lib/picks/edits";
import { addGame, openWeek, publishSlate, setTiebreaker, type Slate } from "@/lib/slate/slate";
import type { Game, Member, Week } from "@/db/schema";
import { createTestDb } from "./db";

/** Sat 2026-09-12 23:30Z */
export const OHIO_STATE_AT_TEXAS = 401856682;
/** Sat 2026-09-12 16:00Z */
export const OKLAHOMA_AT_MICHIGAN = 401856679;
/** Fri 2026-09-11 00:00Z */
export const FAMU_AT_MIAMI = 401858213;

export const WEEK_2 = { year: 2026, week: 2 } as const;

/** Before the Slate is published. */
export const TUESDAY = new Date("2026-09-08T18:00:00Z");
/** Picks are open: after publish, before the Deadline. */
export const THURSDAY = new Date("2026-09-10T20:00:00Z");
/** Michigan is over, Texas has not kicked off. */
export const SATURDAY_EVENING = new Date("2026-09-12T20:00:00Z");
/** Every game is done. */
export const SUNDAY = new Date("2026-09-13T12:00:00Z");

export interface Week2Fixture {
  db: Db;
  jonah: Member;
  grandma: Member;
  cfbd: CfbdClient;
  /**
   * The recorded forecast, so the fixture's games carry a real chance of rain
   * and anything that refreshes them compares like with like.
   */
  rain: RainChanceSource;
  candidates: CandidateGame[];
  /** The candidate for a recorded game id; throws nothing, the ids are known. */
  candidate: (cfbdGameId: number) => CandidateGame;
}

/**
 * Adds a member who joined at a given instant. Who is on a Week's board turns
 * on `joinedAt` against the Deadline, so a test that puts someone either side
 * of it says which side here rather than leaning on the wall clock.
 */
export async function joinAt(db: Db, commissioner: Member, displayName: string, at: Date): Promise<Member> {
  const member = await addMember(db, commissioner, { displayName });
  const [pinned] = await db.update(members).set({ joinedAt: at }).where(eq(members.id, member.id)).returning();
  return pinned;
}

/** A fresh database with the 2026 season, two members, and the Week 2 candidates. */
export async function seedWeek2(): Promise<Week2Fixture> {
  const db = await createTestDb();
  await db.insert(seasons).values({ year: 2026, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2 }, active: true });
  const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });
  const grandma = await addMember(db, jonah, { displayName: "Grandma" });
  // Pinned before any Week 2 Deadline, so no suite depends on the wall clock
  // for whether these two are on the board.
  await db.update(members).set({ joinedAt: TUESDAY });
  const cfbd = recordedCfbd("2026-week-2");
  const rain = recordedOpenMeteo("2026-week-2");
  const candidates = await weekCandidates(cfbd, WEEK_2, rain);
  const candidate = (cfbdGameId: number) => candidates.find((c) => c.cfbdGameId === cfbdGameId)!;
  return {
    db,
    jonah: { ...jonah, joinedAt: TUESDAY },
    grandma: { ...grandma, joinedAt: TUESDAY },
    cfbd,
    rain,
    candidates,
    candidate,
  };
}

export interface PublishedWeek2 extends Week2Fixture {
  week: Week;
  /** As it stood at publish; re-read it with `slateFor` after anything writes to a game. */
  slate: Slate;
  deadline: Date;
  miami: Game;
  michigan: Game;
  texas: Game;
}

/**
 * The published Week every server-seam suite works against: three Week 2
 * games, Texas as the Tiebreaker Game, published on Tuesday so the Deadline
 * is Friday's Miami kickoff. Built once here rather than by hand in each
 * suite, so a change to publishing is one edit and the suites cannot drift.
 */
export async function publishWeek2(): Promise<PublishedWeek2> {
  const seeded = await seedWeek2();
  const { db, jonah, candidate } = seeded;
  const week = await openWeek(db, jonah, WEEK_2.week);
  const miami = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
  await setTiebreaker(db, jonah, week.id, texas.id);
  const slate = await publishSlate(db, jonah, week.id, TUESDAY);
  return { ...seeded, week, slate, deadline: slate.deadline!, miami, michigan, texas };
}

/**
 * Seeding a member's own sheet, the way the phone does it: through the one
 * writer, under a member's own Authority, so the Deadline applies and nothing
 * is audited. A suite that wants a commissioner's edit calls `applyEdit` with
 * `asCommissioner` itself — that is the thing under test, not a fixture.
 *
 * These take the Slate because the writer does. A suite that voids a game
 * re-reads it with `slateFor` before editing against it, which is the point:
 * the rows the caller is holding are what the writer decides from.
 */
export function pickAs(db: Db, member: Member, slate: Slate, game: Game, teamId: number, now: Date) {
  return applyEdit(db, asMember(member), slate, { kind: "pick", gameId: game.id, teamId }, now);
}

export function lockAs(db: Db, member: Member, slate: Slate, gameId: number | null, now: Date) {
  return applyEdit(db, asMember(member), slate, { kind: "lock", gameId }, now);
}

export function guessAs(db: Db, member: Member, slate: Slate, guess: number | null, now: Date) {
  return applyEdit(db, asMember(member), slate, { kind: "guess", guess }, now);
}

/** Scores by recorded game id: `[away, home]`. */
export type Finals = Record<number, [away: number, home: number]>;

/** A running score by recorded game id, with the quarter and clock the board would show for it. */
export type Live = Record<number, [away: number, home: number, period?: number, clock?: string]>;

/** How many times each feed endpoint answered. */
export interface FeedReads {
  games: number;
  scoreboard: number;
}

export type Feed = CfbdClient & {
  /** Every feed read, whichever endpoint: what the stale gate is judged on. */
  calls: number;
  reads: FeedReads;
};

/**
 * The Week 2 recording with some games reported final, and some in play,
 * said the same way on both feeds the ingest reads — the scoreboard it reads
 * first, and the `/games` week it falls back to for a game the board does
 * not list. The fixture files carry no scores at all: every recorded game is
 * `completed: false` with null points, because the week had not been played
 * when it was recorded, so a suite that wants a result says so here.
 *
 * `calls` counts feed reads, which is what the stale gate is judged on;
 * `reads` says which endpoint took them, for the one suite that cares.
 *
 * `offBoard` drops games from the scoreboard while `/games` still carries
 * them: the board is the week being played, and a game can be missing from it
 * either side of its own week.
 */
export function feedWith(finals: Finals, live: Live = {}, { offBoard = [] as number[] } = {}): Feed {
  const recorded = recordings["2026-week-2"].games;
  const feedGames: CfbdGame[] = recorded.map((g) => {
    const final = finals[g.id];
    const inPlay = live[g.id];
    if (final) return { ...g, completed: true, awayPoints: final[0], homePoints: final[1] };
    if (inPlay) return { ...g, completed: false, awayPoints: inPlay[0], homePoints: inPlay[1] };
    return g;
  });
  const board: CfbdScoreboardGame[] = scoreboardOf(recorded.filter((g) => !offBoard.includes(g.id))).map((g) => {
    const final = finals[g.id];
    const inPlay = live[g.id];
    const sides = (away: number, home: number) => ({
      awayTeam: { ...g.awayTeam, points: away },
      homeTeam: { ...g.homeTeam, points: home },
    });
    if (final) return { ...g, status: "completed", ...sides(final[0], final[1]) };
    if (inPlay) {
      return { ...g, status: "in_progress", period: inPlay[2] ?? null, clock: inPlay[3] ?? null, ...sides(inPlay[0], inPlay[1]) };
    }
    return g;
  });
  const inner = recordedCfbd("2026-week-2", { games: feedGames, scoreboard: board });
  const client: Feed = {
    ...inner,
    calls: 0,
    reads: { games: 0, scoreboard: 0 },
    games: async (q: { year: number; week: number }) => {
      client.calls += 1;
      client.reads.games += 1;
      return inner.games(q);
    },
    scoreboard: async () => {
      client.calls += 1;
      client.reads.scoreboard += 1;
      return inner.scoreboard();
    },
  };
  return client;
}
