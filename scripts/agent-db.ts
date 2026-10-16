/**
 * A throwaway database for an agent to sign in to and check its work on: a
 * branch of the `slate-agents` Neon project, migrated and seeded with a fake
 * league, deleted when the check is done. Built for the agent:go routine's
 * cloud runs (`.claude/skills/agent-go/SKILL.md`), where it is the only way to
 * reach a signed-in screen without a Magic Link.
 *
 *   npm run agent-db -- up <name>         # branch, .env.local, migrate, seed
 *   npm run agent-db -- up <name> --live  # the same, with a game under way
 *   npm run agent-db -- session <member>  # prints slate_session=<id>
 *   npm run agent-db -- down              # deletes the branch and .env.local
 *
 * Needs NEON_PROJECT_ID. In the cloud, the environment's network secret adds
 * the API key to every console.neon.tech request, so no key is in the VM; run
 * by hand, set NEON_API_KEY to a key for `slate-agents` and it is sent instead.
 *
 * It refuses to touch a checkout that already has a `.env.local` it did not
 * write, and to seed a database that already has members, so it cannot land on
 * the shared Development database or production.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import type { CfbdLiveGame } from "../src/lib/cfbd/types";
import { newestPlay, toLiveFeed } from "../src/lib/results/live-feed";

const ENV_FILE = ".env.local";
const STATE_FILE = ".agent-db.json";
const LIVE_FIXTURE = "src/lib/cfbd/fixtures/live-plays/401869941-q2.json";
const MARKER = "# Written by scripts/agent-db.ts: a throwaway slate-agents branch.";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface State {
  branchId: string;
  branchName: string;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const project = process.env.NEON_PROJECT_ID;
  if (!project) throw new Error("NEON_PROJECT_ID is not set.");
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  if (process.env.NEON_API_KEY) headers.authorization = `Bearer ${process.env.NEON_API_KEY}`;
  try {
    return await fetch(`https://console.neon.tech/api/v2/projects/${project}/${path}`, { ...init, headers });
  } catch (error) {
    // Node's own fetch ignores HTTPS_PROXY unless told otherwise, and the cloud
    // reaches the internet only through that proxy.
    if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
      throw new Error("fetch failed behind HTTPS_PROXY: run with NODE_USE_ENV_PROXY=1.", { cause: error });
    }
    throw error;
  }
}

function ownsEnvFile(): boolean {
  return existsSync(ENV_FILE) && readFileSync(ENV_FILE, "utf8").startsWith(MARKER);
}

function connect(url: string) {
  return drizzle({ client: neon(url), schema });
}

async function up(name: string, live: boolean) {
  if (existsSync(ENV_FILE) && !ownsEnvFile()) {
    throw new Error(`${ENV_FILE} already exists and agent-db did not write it. Run this in a checkout without one.`);
  }
  if (existsSync(STATE_FILE)) throw new Error(`${STATE_FILE} exists: run \`npm run agent-db -- down\` first.`);

  const branchName = `agent-${name.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-${Date.now()}`;
  const response = await api("branches", {
    method: "POST",
    body: JSON.stringify({ branch: { name: branchName }, endpoints: [{ type: "read_write" }] }),
  });
  if (!response.ok) throw new Error(`Creating the branch failed: ${response.status} ${await response.text()}`);
  const created = (await response.json()) as {
    branch: { id: string };
    connection_uris?: { connection_uri: string }[];
  };
  const url = created.connection_uris?.[0]?.connection_uri;
  if (!url) throw new Error("Neon returned no connection string for the new branch.");
  writeFileSync(STATE_FILE, JSON.stringify({ branchId: created.branch.id, branchName } satisfies State));
  writeFileSync(ENV_FILE, `${MARKER}\nDATABASE_URL=${url}\nDATABASE_URL_UNPOOLED=${url}\n`);
  console.log(`Created branch ${branchName}.`);

  await waitForDatabase(url);
  execFileSync("npx", ["drizzle-kit", "migrate"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });
  console.log("Migrated.");
  await seed(connect(url), live);
}

async function waitForDatabase(url: string) {
  const client = neon(url);
  for (let attempt = 0; ; attempt++) {
    try {
      await client`select 1`;
      return;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

const secret = () => randomBytes(24).toString("base64url");

type Team = { school: string; id: number; conference: string };
const team = (school: string, id: number, conference: string): Team => ({ school, id, conference });

/** Six matchups a Week, real schools so the logos and colours resolve. */
const LAST_WEEK: [Team, Team, string][] = [
  [team("Alabama", 333, "SEC"), team("Georgia", 61, "SEC"), "Georgia -3.5"],
  [team("Ohio State", 194, "Big Ten"), team("Michigan", 130, "Big Ten"), "Ohio State -7"],
  [team("Texas", 251, "SEC"), team("Oklahoma", 201, "SEC"), "Texas -4.5"],
  [team("Oregon", 2483, "Big Ten"), team("USC", 30, "Big Ten"), "Oregon -10"],
  [team("LSU", 99, "SEC"), team("Ole Miss", 145, "SEC"), "PK"],
  [team("Penn State", 213, "Big Ten"), team("Iowa", 2294, "Big Ten"), "Penn State -6"],
];
const THIS_WEEK: [Team, Team, string][] = [
  [team("Tennessee", 2633, "SEC"), team("Florida", 57, "SEC"), "Tennessee -6.5"],
  [team("Washington", 264, "Big Ten"), team("UCLA", 26, "Big Ten"), "Washington -9"],
  [team("Texas A&M", 245, "SEC"), team("Missouri", 142, "SEC"), "Texas A&M -2.5"],
  [team("Wisconsin", 275, "Big Ten"), team("Nebraska", 158, "Big Ten"), "PK"],
  [team("Auburn", 2, "SEC"), team("Arkansas", 8, "SEC"), "Auburn -3"],
  [team("Arizona", 12, "Big 12"), team("BYU", 252, "Big 12"), "BYU -1.5"],
];
/** Away score, home score for last week's finals. */
const LAST_SCORES: [number, number][] = [
  [24, 27],
  [31, 17],
  [20, 23],
  [35, 14],
  [28, 31],
  [21, 13],
];

/**
 * Fixture members, each in a state a check might need: a commissioner who
 * organizes the group, members with every pick in, one partway, two with none,
 * and one who has not finished the welcome page.
 */
const MEMBERS = [
  { displayName: "Casey", commissioner: true, avatar: "pennants-04", picks: "all" },
  { displayName: "Jordan", commissioner: false, avatar: "pennants-06", picks: "all" },
  { displayName: "Riley", commissioner: false, avatar: "pennants-07", picks: "all" },
  { displayName: "Morgan", commissioner: false, avatar: "pennants-04", picks: "some" },
  { displayName: "Taylor", commissioner: false, avatar: "pennants-06", picks: "none" },
  { displayName: "Sam", commissioner: false, avatar: "pennants-07", picks: "none" },
  { displayName: "Drew", commissioner: false, avatar: null, picks: "none" },
] as const;

async function seed(db: ReturnType<typeof connect>, live: boolean) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.members);
  if (count > 0) throw new Error(`Refusing to seed: this database already has ${count} members.`);

  const now = Date.now();
  const joined = new Date(now - 30 * DAY);
  const [season] = await db
    .insert(schema.seasons)
    .values({
      year: new Date(now).getUTCFullYear(),
      active: true,
      rules: {
        pointsPerCorrectPick: 10,
        lockMultiplier: 2,
        tiebreakOrder: "Total points, then weekly wins, then closest cumulative Tiebreaker Guess error.",
      },
    })
    .returning();

  const members = await db
    .insert(schema.members)
    .values(
      MEMBERS.map((m) => ({
        displayName: m.displayName,
        isCommissioner: m.commissioner,
        avatarId: m.avatar,
        token: secret(),
        joinedAt: joined,
        welcomedAt: m.avatar ? joined : null,
      })),
    )
    .returning();
  const [group] = await db.insert(schema.groups).values({ name: "Fixture League", joinToken: secret() }).returning();
  await db.insert(schema.memberships).values(
    members.map((m) => ({
      groupId: group.id,
      memberId: m.id,
      role: m.isCommissioner ? ("organizer" as const) : ("member" as const),
      joinedAt: joined,
    })),
  );
  // Welcomed members have seen the Welcome Tour, so it covers no screen; delete
  // a member's row to check the Tour itself.
  await db
    .insert(schema.tourDismissals)
    .values(members.filter((m) => m.welcomedAt).map((m) => ({ memberId: m.id, tourId: "welcome" as const })));

  const lastDeadline = new Date(now - 6 * DAY);
  // --live: the Deadline has passed and one game is under way; the rest kick off later today.
  const thisDeadline = new Date(live ? now - 90 * 60 * 1000 : now + 3 * DAY);
  const last = await addWeek(db, season.id, 6, lastDeadline, LAST_WEEK, LAST_SCORES);
  const current = await addWeek(db, season.id, 7, thisDeadline, THIS_WEEK, null, live ? new Date(now + 2 * HOUR) : thisDeadline);
  if (live) current.games.unshift(await addLiveGame(db, current.weekId, thisDeadline));

  for (const [index, member] of members.entries()) {
    const plan = MEMBERS[index];
    if (!member.welcomedAt) continue;
    // Everyone welcomed played last week; picks vary by member so the board is not unanimous.
    await addPicks(db, member.id, last, (game) => (game + index) % 3 !== 0, index % last.games.length, 40 + index * 3);
    if (plan.picks === "all") {
      await addPicks(db, member.id, current, (game) => (game + index) % 2 === 0, index % current.games.length, 45 + index);
    } else if (plan.picks === "some") {
      await addPicks(db, member.id, current, () => true, null, null, 2);
    }
  }

  console.log(
    live
      ? `Seeded the ${season.year} season, Week 6 final and Week 7 locked with Liberty at Coastal Carolina under way (Q2 10:27, 10–3).`
      : `Seeded the ${season.year} season, Week 6 final and Week 7 open (Deadline ${thisDeadline.toISOString()}).`,
  );
  console.log("Members (sign in with `npm run agent-db -- session <name>`):");
  for (const [index, member] of members.entries()) {
    const plan = MEMBERS[index];
    const role = member.isCommissioner ? "commissioner + organizer" : "member";
    const state = member.welcomedAt ? `Week 7 picks: ${plan.picks}` : "not welcomed yet (/welcome)";
    console.log(`  ${member.displayName} — ${role}, ${state}`);
  }
}

interface SeededWeek {
  weekId: number;
  games: { id: number; homeTeamId: number; awayTeamId: number }[];
}

async function addWeek(
  db: ReturnType<typeof connect>,
  seasonId: number,
  weekNumber: number,
  deadline: Date,
  matchups: [Team, Team, string][],
  scores: [number, number][] | null,
  kickoffFrom: Date = deadline,
): Promise<SeededWeek> {
  const [week] = await db
    .insert(schema.weeks)
    .values({ seasonId, weekNumber, deadline, published: true })
    .returning();
  const games = await db
    .insert(schema.games)
    .values(
      matchups.map(([away, home, spread], index) => ({
        weekId: week.id,
        cfbdGameId: 900_000 + weekNumber * 100 + index,
        awayTeamId: away.id,
        awayTeam: away.school,
        awayConference: away.conference,
        homeTeamId: home.id,
        homeTeam: home.school,
        homeConference: home.conference,
        kickoff: new Date(kickoffFrom.getTime() + Math.floor(index / 2) * 3 * HOUR),
        spread,
        ...(scores ? { status: "final" as const, awayScore: scores[index][0], homeScore: scores[index][1] } : {}),
      })),
    )
    .returning();
  await db
    .update(schema.weeks)
    .set({ tiebreakerGameId: games[games.length - 1].id })
    .where(sql`${schema.weeks.id} = ${week.id}`);
  return { weekId: week.id, games };
}

/**
 * Picks for one member: `home(gameIndex)` chooses the home side, `lock` is the
 * index of the Locked game, `guess` the Tiebreaker Guess; `limit` stops after
 * that many games for a member partway through.
 */
async function addPicks(
  db: ReturnType<typeof connect>,
  memberId: number,
  week: SeededWeek,
  home: (gameIndex: number) => boolean,
  lock: number | null,
  guess: number | null,
  limit = week.games.length,
) {
  const games = week.games.slice(0, limit);
  await db.insert(schema.picks).values(
    games.map((game, index) => ({
      memberId,
      gameId: game.id,
      teamId: home(index) ? game.homeTeamId : game.awayTeamId,
      updatedBy: memberId,
    })),
  );
  if (lock !== null) {
    await db.insert(schema.locks).values({ memberId, weekId: week.weekId, gameId: week.games[lock].id, updatedBy: memberId });
  }
  if (guess !== null) {
    await db.insert(schema.tiebreakerGuesses).values({ memberId, weekId: week.weekId, guess, updatedBy: memberId });
  }
}

/**
 * A real game under way, from CFBD's recorded play-by-play (Liberty at Coastal
 * Carolina, Q2 10:27): the row's live columns as the scoreboard would leave
 * them, its `live_feed` slice through the app's own `toLiveFeed`, and the
 * whole feed in `live_feeds` for the Game sheet.
 */
async function addLiveGame(db: ReturnType<typeof connect>, weekId: number, kickoff: Date) {
  // The app never reads the feed's `teams`, so its type leaves them unknown; the fixture has them.
  type FeedTeam = { teamId: number; team: string; homeAway: "home" | "away"; points: number };
  const feed = JSON.parse(readFileSync(LIVE_FIXTURE, "utf8")) as Omit<CfbdLiveGame, "teams"> & { teams: FeedTeam[] };
  const home = feed.teams.find((t) => t.homeAway === "home")!;
  const away = feed.teams.find((t) => t.homeAway === "away")!;
  const teams = { homeTeamId: home.teamId, awayTeamId: away.teamId };
  const [game] = await db
    .insert(schema.games)
    .values({
      weekId,
      cfbdGameId: feed.id,
      homeTeamId: home.teamId,
      homeTeam: home.team,
      homeConference: "Sun Belt",
      awayTeamId: away.teamId,
      awayTeam: away.team,
      awayConference: "Conference USA",
      kickoff,
      spread: "Liberty -3.5",
      status: "in_progress",
      homeScore: home.points,
      awayScore: away.points,
      period: feed.period,
      clock: feed.clock,
      possession: feed.possession === home.team ? "home" : "away",
      lastPlay: newestPlay(feed.drives)?.playText ?? null,
      liveFeed: toLiveFeed(feed, teams),
    })
    .returning();
  await db.insert(schema.liveFeeds).values({ gameId: game.id, drives: feed.drives, fetchedAt: new Date() });
  return game;
}

async function session(name: string) {
  if (!ownsEnvFile()) throw new Error(`No agent-db ${ENV_FILE} here: run \`npm run agent-db -- up <name>\` first.`);
  process.loadEnvFile(ENV_FILE);
  const db = connect(process.env.DATABASE_URL ?? "");
  const member = await db.query.members.findFirst({ where: sql`lower(${schema.members.displayName}) = lower(${name})` });
  if (!member) throw new Error(`No fixture member named ${name}.`);
  const id = secret();
  await db.insert(schema.sessions).values({ id, memberId: member.id });
  // A throwaway branch's session: printing it is how the caller gets it.
  console.log(`slate_session=${id}`);
}

async function down() {
  if (!existsSync(STATE_FILE)) throw new Error(`No ${STATE_FILE}: nothing to delete.`);
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  const response = await api(`branches/${state.branchId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Deleting ${state.branchName} failed: ${response.status} ${await response.text()}`);
  }
  rmSync(STATE_FILE);
  if (ownsEnvFile()) rmSync(ENV_FILE);
  console.log(`Deleted branch ${state.branchName}.`);
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "up") return up(arg && arg !== "--live" ? arg : "check", process.argv.includes("--live"));
  if (command === "session" && arg) return session(arg);
  if (command === "down") return down();
  throw new Error("Usage: npm run agent-db -- up <name> | session <member> | down");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
