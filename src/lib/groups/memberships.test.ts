/**
 * Groups arrive in the data before any screen reads them. Two things are held
 * here: the migration that moves the family into Mabry Family changes no read
 * anyone sees, and the seam the group-scoped boards will build on answers who
 * is in a group, as what, since when, and with which gaps.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, test } from "vitest";
import * as schema from "@/db/schema";
import { groups, locks, memberships, membershipRemovals, members, picks, seasons, tiebreakerGuesses } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Commissioner } from "@/lib/members/authority";
import { seasonResult, ingestResults, weekResult } from "@/lib/results/results";
import { addGame, openWeek, publishSlate, setTiebreaker, slateFor } from "@/lib/slate/slate";
import { createTestDb } from "@/test/db";
import {
  FAMU_AT_MIAMI,
  feedWith,
  guessAs,
  lockAs,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  pickAs,
  seedWeek2,
  SUNDAY,
  THURSDAY,
  TUESDAY,
} from "@/test/week-2";
import { weekCandidates } from "@/lib/cfbd/candidates";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import { recordedOpenMeteo } from "@/lib/weather/recorded";
import { groupRoster, memberGroups, MABRY_FAMILY } from "./memberships";

/** The migration before groups: the schema production ran through Week 2. */
const BEFORE_GROUPS = "0004_live-clock";

/** A copy of the committed migrations that stops at `lastTag`, for a database as it stood then. */
function migrationsThrough(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), "migrations-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last < 0) throw new Error(`No migration ${lastTag}`);
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, last + 1) }));
  return folder;
}

const WEDNESDAY = new Date("2026-09-09T18:00:00Z");
/** After Week 2's Deadline: joined too late to count in it. */
const SATURDAY = new Date("2026-09-12T12:00:00Z");

/**
 * The family as production holds it before the migration, written straight
 * into the tables: `addMember` now joins a group, and there is no group table
 * yet. Two commissioners, members who joined on different days, one since
 * deactivated with Picks, one who joined after the Deadline, and a week graded.
 */
async function familyBeforeGroups() {
  const client = new PGlite();
  const db: Db = drizzle({ client, schema });
  await migrate(drizzle({ client, schema }), { migrationsFolder: migrationsThrough(BEFORE_GROUPS) });

  await db.insert(seasons).values({
    year: 2026,
    rules: {
      pointsPerCorrectPick: 10,
      lockMultiplier: 2,
      tiebreakOrder: "Total points, then weekly wins, then closest cumulative Tiebreaker Guess error.",
    },
    active: true,
  });
  const add = async (displayName: string, joinedAt: Date, extra: Partial<typeof members.$inferInsert> = {}) =>
    (
      await db
        .insert(members)
        .values({ displayName, joinedAt, token: `token-${displayName}`, ...extra })
        .returning()
    )[0];
  const jonah = (await add("Jonah", TUESDAY, { isCommissioner: true })) as Commissioner;
  const alex = await add("Alex", TUESDAY, { isCommissioner: true, phone: "+12565550100" });
  const grandma = await add("Grandma", WEDNESDAY, { phone: "+12565550140" });
  const cousin = await add("Cousin", TUESDAY, { phone: "+12565550150" });
  const latecomer = await add("Latecomer", SATURDAY);

  const cfbd = recordedCfbd("2026-week-2");
  const candidates = await weekCandidates(cfbd, { year: 2026, week: 2 }, recordedOpenMeteo("2026-week-2"));
  const candidate = (id: number) => candidates.find((c) => c.cfbdGameId === id)!;
  const week = await openWeek(db, jonah, 2);
  const miami = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
  await setTiebreaker(db, jonah, week.id, texas.id);
  const slate = await publishSlate(db, jonah, week.id, TUESDAY);

  for (const [member, teams, guess] of [
    [jonah, [miami.homeTeamId, michigan.homeTeamId, texas.awayTeamId], 51],
    [alex, [miami.awayTeamId, michigan.homeTeamId, texas.homeTeamId], 44],
    [grandma, [miami.homeTeamId, michigan.awayTeamId, texas.awayTeamId], 60],
    [cousin, [miami.homeTeamId, michigan.homeTeamId, texas.homeTeamId], 47],
  ] as const) {
    for (const [game, teamId] of [miami, michigan, texas].map((g, i) => [g, teams[i]] as const)) {
      await pickAs(db, member, slate, game, teamId, THURSDAY);
    }
    await lockAs(db, member, slate, michigan.id, THURSDAY);
    await guessAs(db, member, slate, guess, THURSDAY);
  }
  await db.update(members).set({ active: false }).where(eq(members.id, cousin.id));
  await ingestResults(
    db,
    feedWith({ [FAMU_AT_MIAMI]: [3, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27], [OHIO_STATE_AT_TEXAS]: [28, 24] }),
    slate,
    SUNDAY,
  );

  return { client, db, weekId: week.id, family: [jonah, alex, grandma, cousin, latecomer] };
}

/** Everything a family member sees that the migration could move, read the way the screens read it. */
async function boards(db: Db, weekId: number) {
  const season = await seasonResult(db, SUNDAY);
  const week = await weekResult(db, await slateFor(db, weekId), SUNDAY);
  const rows = {
    members: await db.select().from(members).orderBy(asc(members.id)),
    picks: await db.select().from(picks).orderBy(asc(picks.id)),
    locks: await db.select().from(locks).orderBy(asc(locks.memberId)),
    guesses: await db.select().from(tiebreakerGuesses).orderBy(asc(tiebreakerGuesses.memberId)),
  };
  return { leaderboard: season.leaderboard, weeks: season.weeks, reveal: week.reveal, scores: week.scores, rows };
}

describe("moving the family into Mabry Family", () => {
  test("the Leaderboard, the Reveal, and every Pick read the same after the migration as before it", async () => {
    const { client, db, weekId } = await familyBeforeGroups();
    const before = await boards(db, weekId);
    // The fixture has something to lose: a graded week with a winner and a deactivated member on it.
    expect(before.leaderboard.map((row) => row.member.displayName)).toContain("Cousin");
    expect(before.scores.length).toBe(4);

    await migrate(drizzle({ client, schema }), { migrationsFolder: "drizzle" });

    expect(await boards(db, weekId)).toEqual(before);
  });

  test("every member, deactivated included, is in Mabry Family from the day they joined, and the commissioners organize it", async () => {
    const { client, db, family } = await familyBeforeGroups();
    await migrate(drizzle({ client, schema }), { migrationsFolder: "drizzle" });

    const all = await db.select().from(groups);
    expect(all.map((g) => g.name)).toEqual([MABRY_FAMILY]);
    expect(all[0].joinToken.length).toBeGreaterThanOrEqual(32);

    const roster = await groupRoster(db, all[0].id);
    const inJoinedOrder = [...family].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id - b.id);
    expect(roster.map((entry) => [entry.member.displayName, entry.role, entry.joinedAt, entry.removals])).toEqual(
      inJoinedOrder.map((m) => [m.displayName, m.isCommissioner ? "organizer" : "member", m.joinedAt, []]),
    );
    // Cousin is deactivated and Latecomer joined after the Deadline: the roster is the data, not a board.
    expect(roster.map((entry) => entry.member.displayName)).toEqual(["Jonah", "Alex", "Cousin", "Grandma", "Latecomer"]);
    expect(await db.select().from(membershipRemovals)).toEqual([]);
  });
});

describe("a member's groups and a group's roster", () => {
  async function twoGroups() {
    const fixture = await seedWeek2();
    const { db } = fixture;
    const [family] = await db.select().from(groups);
    const [friends] = await db.insert(groups).values({ name: "Friends", joinToken: "friends-token" }).returning();
    return { ...fixture, family, friends };
  }

  test("a commissioner bootstrapped by the seed organizes Mabry Family, and a member the console adds joins it", async () => {
    const { db, family, jonah, grandma } = await twoGroups();

    expect((await memberGroups(db, jonah.id)).map((g) => [g.group.name, g.role])).toEqual([[MABRY_FAMILY, "organizer"]]);
    expect((await memberGroups(db, grandma.id)).map((g) => [g.group.name, g.role])).toEqual([[MABRY_FAMILY, "member"]]);
    expect((await groupRoster(db, family.id)).map((entry) => entry.member.displayName)).toEqual(["Jonah", "Grandma"]);
  });

  test("a member in two groups sees both, each with its own role and joined-at", async () => {
    const { db, friends, grandma } = await twoGroups();
    await db.insert(memberships).values({ groupId: friends.id, memberId: grandma.id, role: "organizer", joinedAt: SATURDAY });

    expect((await memberGroups(db, grandma.id)).map((g) => [g.group.name, g.role, g.joinedAt])).toEqual([
      [MABRY_FAMILY, "member", TUESDAY],
      ["Friends", "organizer", SATURDAY],
    ]);
    expect((await groupRoster(db, friends.id)).map((entry) => entry.member.displayName)).toEqual(["Grandma"]);
  });

  test("a removed member stays on the roster with the period they were out, and is not in the group until restored", async () => {
    const { db, family, grandma } = await twoGroups();
    await db
      .insert(membershipRemovals)
      .values({ groupId: family.id, memberId: grandma.id, removedAt: WEDNESDAY, restoredAt: SATURDAY });

    expect((await groupRoster(db, family.id)).find((e) => e.member.id === grandma.id)?.removals).toEqual([
      { removedAt: WEDNESDAY, restoredAt: SATURDAY },
    ]);
    expect(await memberGroups(db, grandma.id)).toHaveLength(1);

    await db.insert(membershipRemovals).values({ groupId: family.id, memberId: grandma.id, removedAt: SUNDAY });

    expect((await groupRoster(db, family.id)).find((e) => e.member.id === grandma.id)?.removals).toEqual([
      { removedAt: WEDNESDAY, restoredAt: SATURDAY },
      { removedAt: SUNDAY, restoredAt: null },
    ]);
    expect(await memberGroups(db, grandma.id)).toEqual([]);
  });

  test("a membership is removed at most once at a time, and never restored before it was removed", async () => {
    const { db, family, grandma } = await twoGroups();
    await db.insert(membershipRemovals).values({ groupId: family.id, memberId: grandma.id, removedAt: WEDNESDAY });

    await expect(
      db.insert(membershipRemovals).values({ groupId: family.id, memberId: grandma.id, removedAt: SATURDAY }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(membershipRemovals)
        .values({ groupId: family.id, memberId: grandma.id, removedAt: SATURDAY, restoredAt: WEDNESDAY }),
    ).rejects.toThrow();
  });

  test("a member of no group has no groups, and an empty group has no roster", async () => {
    const db = await createTestDb();
    const [lonely] = await db.insert(members).values({ displayName: "Lonely", token: "lonely" }).returning();
    const [empty] = await db.insert(groups).values({ name: "Empty", joinToken: "empty-token" }).returning();

    expect(await memberGroups(db, lonely.id)).toEqual([]);
    expect(await groupRoster(db, empty.id)).toEqual([]);
  });
});
