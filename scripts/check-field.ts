/**
 * Runs a Saturday's stored live feeds through the field parser and reports
 * each game whose spots left a team unplaced or drew runs and catches as
 * jumps, with the play texts that show the spelling. Read-only. Exits 1 when
 * any game has a gap.
 *
 *   npm run check-field -- 2026-10-03           # against .env.local's DATABASE_URL (Development)
 *   npm run check-field -- 2026-10-03 --prod    # against POSTGRES_URL, which is Production
 *
 * A date's games are those kicking off from 12:00 UTC that day to 12:00 UTC
 * the next, so a late West Coast kickoff counts as Saturday's.
 */
import { neon } from "@neondatabase/serverless";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { games, liveFeeds } from "../src/db/schema";
import { requireEnv } from "../src/lib/env";
import { checkField } from "../src/lib/results/field-check";

async function main() {
  const date = process.argv.slice(2).find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  if (!date) throw new Error("Name the date: npm run check-field -- 2026-10-03 [--prod]");
  const prod = process.argv.includes("--prod");
  const db = drizzle({ client: neon(requireEnv(prod ? "POSTGRES_URL" : "DATABASE_URL")), schema });

  const from = new Date(`${date}T12:00:00Z`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      awayTeam: games.awayTeam,
      homeTeam: games.homeTeam,
      awayTeamId: games.awayTeamId,
      homeTeamId: games.homeTeamId,
      drives: liveFeeds.drives,
    })
    .from(liveFeeds)
    .innerJoin(games, eq(games.id, liveFeeds.gameId))
    .where(and(gte(games.kickoff, from), lt(games.kickoff, to)))
    .orderBy(asc(games.kickoff));
  if (rows.length === 0) {
    console.log(`No stored live feeds for games kicking off ${date}${prod ? " in Production" : ""}.`);
    return true;
  }

  let clean = true;
  for (const row of rows) {
    const plays = row.drives.flatMap((drive) => drive.plays);
    const check = checkField(plays, row);
    const name = `${row.awayTeam} @ ${row.homeTeam}`;
    const unplaced = check.unplaced.map((side) => (side === "home" ? row.homeTeam : row.awayTeam));
    const ok = unplaced.length === 0 && check.jumpOnly === 0;
    clean &&= ok;
    console.log(
      `${ok ? "ok  " : "GAP "} ${name}: ${check.jumpOnly} of ${check.runsAndCatches} runs and catches drawn as jumps` +
        (unplaced.length > 0 ? `; can't place ${unplaced.join(" or ")}` : ""),
    );
    for (const sample of check.samples) console.log(`       ${sample}`);
  }
  return clean;
}

main().then(
  (clean) => process.exit(clean ? 0 : 1),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
