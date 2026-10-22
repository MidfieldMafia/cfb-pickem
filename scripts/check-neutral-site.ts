/**
 * Read-only: asks the live /games feed for a Week and prints what `weekDetails`
 * stores as `neutralSite`, to confirm the real API sends the flag under that name.
 *
 *   CFBD_API_KEY=... npx tsx scripts/check-neutral-site.ts [week]   # 2026 Week 1 by default: Auburn v Baylor
 *
 * Spends one run of the week's detail reads against the CFBD quota.
 */
import { weekDetails } from "../src/lib/cfbd/details";
import { httpCfbd } from "../src/lib/cfbd/http";
import { noRainChance } from "../src/lib/weather/open-meteo";

async function main() {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error("Set CFBD_API_KEY.");
  const query = { year: 2026, week: Number(process.argv[2] ?? 1) };
  const { games, details } = await weekDetails(httpCfbd(key), noRainChance, query);
  const neutral = games.filter((g) => details.get(g.id)?.neutralSite === true);
  console.log(`${games.length} games, ${neutral.length} stored as neutral:`);
  for (const g of neutral) console.log(`  ${g.awayTeam} at ${g.homeTeam}, ${g.venue}, raw neutralSite=${g.neutralSite}`);
  const match = games.find((g) => [g.homeTeam, g.awayTeam].sort().join() === "Auburn,Baylor");
  console.log(match ? `Auburn/Baylor: stored neutralSite=${details.get(match.id)?.neutralSite}` : "Auburn/Baylor: not in the feed");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
