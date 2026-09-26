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
import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, test } from "vitest";
import * as schema from "@/db/schema";
import { groups, locks, memberships, membershipRemovals, members, picks, seasons, tiebreakerGuesses } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Commissioner } from "@/lib/members/authority";
import { seasonResult, weekResult } from "@/lib/results/results";
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
import { ingestResults } from "@/lib/results/writes";

/** The member columns that existed before groups; later migrations only add to them. */
const columnsThen = Object.fromEntries(
  Object.entries(getTableColumns(members)).filter(([name]) => name !== "smsOptedOut"),
) as Omit<ReturnType<typeof getTableColumns<typeof members>>, "smsOptedOut">;

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
  // The members workaround below cannot be used for games: the fixture builds
  // its slate through the app's own `addGame` and `ingestResults`, which name
  // every column in today's schema. So bring `games` alone forward. These
  // columns have nothing to do with the groups migration under test, and
  // `0008_live-detail`, `0013_live-feeds` and `0014_game-stats` add them
  // `if not exists`, so migrating the real folder forward later still passes
  // over them cleanly. `weeks` comes forward for the same reason.
  await db.execute(sql`alter table games add column if not exists possession text`);
  await db.execute(sql`alter table games add column if not exists last_play text`);
  await db.execute(sql`alter table games add column if not exists situation text`);
  await db.execute(sql`alter table games add column if not exists live_feed jsonb`);
  await db.execute(sql`alter table weeks add column if not exists stats_fetched_at timestamp with time zone`);

  await db.insert(seasons).values({
    year: 2026,
    rules: {
      pointsPerCorrectPick: 10,
      lockMultiplier: 2,
      tiebreakOrder: "Total points, then weekly wins, then closest cumulative Tiebreaker Guess error.",
    },
    active: true,
  });
  // Raw SQL, and a select without the newer columns: this database predates them,
  // so the schema's own insert would name columns it does not have yet.
  const add = async (displayName: string, joinedAt: Date, extra: Partial<typeof members.$inferInsert> = {}) => {
    const { rows } = (await db.execute(sql`
      insert into members (display_name, joined_at, token, is_commissioner, phone)
      values (${displayName}, ${joinedAt.toISOString()}, ${`token-${displayName}`}, ${extra.isCommissioner ?? false}, ${extra.phone ?? null})
      returning id`)) as unknown as { rows: { id: number }[] };
    const [{ id }] = rows;
    const [row] = await db.select(columnsThen).from(members).where(eq(members.id, id));
    return { ...row, smsOptedOut: false };
  };
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

/**
 * Every row the migration could touch, read straight from the tables.
 *
 * This used to snapshot the boards too, before and after. It cannot any more:
 * a board is one group's, and the database as it stood before the migration has
 * no `groups` table for a group-scoped read to use. The rows are what can still
 * be compared across the migration — and they are the literal form of the
 * promise that it only adds rows and never rewrites a Pick.
 */
async function rowsOf(db: Db) {
  return {
    members: await db.select(columnsThen).from(members).orderBy(asc(members.id)),
    picks: await db.select().from(picks).orderBy(asc(picks.id)),
    locks: await db.select().from(locks).orderBy(asc(locks.memberId)),
    guesses: await db.select().from(tiebreakerGuesses).orderBy(asc(tiebreakerGuesses.memberId)),
  };
}

describe("moving the family into Mabry Family", () => {
  test("the migration rewrites no member, Pick, Lock or Tiebreaker Guess", async () => {
    const { client, db } = await familyBeforeGroups();
    const before = await rowsOf(db);
    // The fixture has something to lose: every family member's Picks, a Lock and a Guess each.
    expect(before.picks).toHaveLength(12);

    await migrate(drizzle({ client, schema }), { migrationsFolder: "drizzle" });

    expect(await rowsOf(db)).toEqual(before);
  });

  /**
   * The boards the family sees after the move, against Week 2 as the fixture
   * played it, worked by hand rather than read back from a run. Finals are
   * `[away, home]`: Miami and Michigan win at home, Ohio State wins at Texas
   * 28–24, so the Tiebreaker Game totals 52. Every Lock is on Michigan.
   *
   * | member    | Miami | Michigan (Lock) | Texas | points | W–L | guess | miss |
   * |-----------|-------|-----------------|-------|--------|-----|-------|------|
   * | Jonah     | ✓ 10  | ✓ 20            | ✓ 10  | 40     | 3–0 | 51    | 1    |
   * | Cousin    | ✓ 10  | ✓ 20            | ✗     | 30     | 2–1 | 47    | 5    |
   * | Alex      | ✗     | ✓ 20            | ✗     | 20     | 1–2 | 44    | 8    |
   * | Grandma   | ✓ 10  | ✗ 0             | ✓ 10  | 20     | 2–1 | 60    | 8    |
   *
   * Cousin is deactivated but picked, so stays on the board. Latecomer joined
   * after the Deadline: off the week, on the Leaderboard at zero. Alex and
   * Grandma tie on points, Weekly Wins and closeness, so they share 3rd.
   */
  test("Mabry Family's boards after the migration are Week 2 as the family played it", async () => {
    const { client, db, weekId } = await familyBeforeGroups();
    await migrate(drizzle({ client, schema }), { migrationsFolder: "drizzle" });
    const [family] = await db.select().from(groups);

    const week = await weekResult(db, family.id, await slateFor(db, weekId), SUNDAY);
    const season = await seasonResult(db, family.id, SUNDAY);

    expect(
      week.scores.map((s) => [s.member.displayName, s.played, s.points, s.correct, s.incorrect, s.tiebreakerError]),
    ).toEqual([
      ["Jonah", true, 40, 3, 0, 1],
      ["Cousin", true, 30, 2, 1, 5],
      ["Alex", true, 20, 1, 2, 8],
      ["Grandma", true, 20, 2, 1, 8],
    ]);
    expect(week.weeklyWin).toMatchObject({ points: 40, decidedBy: "points" });
    expect(week.weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Jonah"]);

    expect(
      season.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints, r.weeklyWins, r.weeksPlayed]),
    ).toEqual([
      ["Jonah", 1, 40, 1, 1],
      ["Cousin", 2, 30, 0, 1],
      ["Alex", 3, 20, 0, 1],
      ["Grandma", 3, 20, 0, 1],
      ["Latecomer", 5, 0, 0, 0],
    ]);
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
      { removedAt: WEDNESDAY, restoredAt: SATURDAY, kind: "removed" },
    ]);
    expect(await memberGroups(db, grandma.id)).toHaveLength(1);

    await db.insert(membershipRemovals).values({ groupId: family.id, memberId: grandma.id, removedAt: SUNDAY });

    expect((await groupRoster(db, family.id)).find((e) => e.member.id === grandma.id)?.removals).toEqual([
      { removedAt: WEDNESDAY, restoredAt: SATURDAY, kind: "removed" },
      { removedAt: SUNDAY, restoredAt: null, kind: "removed" },
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
