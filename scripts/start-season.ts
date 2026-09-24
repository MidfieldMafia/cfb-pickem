/**
 * Starts a new season: makes it the active one with last season's Rules, and
 * deletes every Group's Chat from earlier seasons. Idempotent: re-running for
 * the same year only finishes the clearing.
 *
 *   npm run start-season -- 2027                     # against .env.local (Development)
 *   npx vercel env pull --environment=production .env.production.local
 *   npx tsx --conditions=react-server --env-file=.env.production.local scripts/start-season.ts 2027
 *
 * The Chat it deletes cannot be brought back.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { requireEnv } from "../src/lib/env";
import { startSeason } from "../src/lib/slate/season";

const db = drizzle({ client: neon(requireEnv("DATABASE_URL")), schema });

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Name the year: npm run start-season -- 2027");
  const season = await startSeason(db, Number(arg));
  console.log(`The ${season.year} season is active, and earlier seasons' Chat is deleted.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
