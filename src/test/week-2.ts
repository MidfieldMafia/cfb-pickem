/**
 * The recorded 2026 Week 2 feed, which every server-seam test builds on. The
 * game ids live here rather than in each test file, so re-recording the fixture
 * is one edit and the names cannot drift from the games they point at.
 */
import { seasons } from "@/db/schema";
import type { Db } from "@/db/types";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import type { CfbdClient } from "@/lib/cfbd/types";
import { addMember, bootstrapCommissioner } from "@/lib/members/members";
import type { Member } from "@/db/schema";
import { createTestDb } from "./db";

/** Sat 2026-09-12 23:30Z */
export const OHIO_STATE_AT_TEXAS = 401856682;
/** Sat 2026-09-12 16:00Z */
export const OKLAHOMA_AT_MICHIGAN = 401856679;
/** Fri 2026-09-11 00:00Z */
export const FAMU_AT_MIAMI = 401858213;

export const WEEK_2 = { year: 2026, week: 2 } as const;

export interface Week2Fixture {
  db: Db;
  jonah: Member;
  grandma: Member;
  cfbd: CfbdClient;
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
  const candidates = await weekCandidates(cfbd, WEEK_2);
  const candidate = (cfbdGameId: number) => candidates.find((c) => c.cfbdGameId === cfbdGameId)!;
  return { db, jonah, grandma, cfbd, candidates, candidate };
}
