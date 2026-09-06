/**
 * The recorded 2026 Week 2 feed, which every server-seam test builds on. The
 * game ids live here rather than in each test file, so re-recording the fixture
 * is one edit and the names cannot drift from the games they point at.
 */
import { members, seasons } from "@/db/schema";
import type { Db } from "@/db/types";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import { recordedOpenMeteo, type RainChanceSource } from "@/lib/weather/open-meteo";
import type { CfbdClient } from "@/lib/cfbd/types";
import { addMember, bootstrapCommissioner } from "@/lib/members/members";
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

/** A fresh database with the 2026 season, two members, and the Week 2 candidates. */
export async function seedWeek2(): Promise<Week2Fixture> {
  const db = await createTestDb();
  await db.insert(seasons).values({ year: 2026, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2 }, active: true });
  const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });
  const grandma = await addMember(db, jonah, { displayName: "Grandma" });
  const cfbd = recordedCfbd("2026-week-2");
  const rain = recordedOpenMeteo("2026-week-2");
  const candidates = await weekCandidates(cfbd, WEEK_2, rain);
  const candidate = (cfbdGameId: number) => candidates.find((c) => c.cfbdGameId === cfbdGameId)!;
  return { db, jonah, grandma, cfbd, rain, candidates, candidate };
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
  // Pin the join dates before the Deadline so no test depends on the wall clock.
  await db.update(members).set({ joinedAt: TUESDAY });
  const week = await openWeek(db, jonah, WEEK_2.week);
  const miami = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
  await setTiebreaker(db, jonah, week.id, texas.id);
  const slate = await publishSlate(db, jonah, week.id, TUESDAY);
  return { ...seeded, week, slate, deadline: slate.deadline!, miami, michigan, texas };
}
