/**
 * Seeds the 2026 season and the two commissioners, then prints their Magic
 * Links. Idempotent: re-running reuses what exists and prints the links again.
 *
 *   npm run seed                      # against .env.local (Development)
 *   npx vercel env pull --environment=production .env.production.local
 *   npx tsx --env-file=.env.production.local scripts/seed.ts
 *
 * Optional: SEED_JONAH_PHONE and SEED_ALEX_PHONE set phones on first creation.
 */
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { appUrl } from "../src/lib/app-url";
import { requireEnv } from "../src/lib/env";
import { bootstrapCommissioner, magicLinkFor } from "../src/lib/members/members";

const db = drizzle({ client: neon(requireEnv("DATABASE_URL")), schema });

const RULES_2026 = {
  pointsPerCorrectPick: 10,
  lockMultiplier: 2,
  tiebreakOrder: "Total points, then weekly wins, then closest cumulative Tiebreaker Guess error.",
};

async function main() {
  const year = 2026;
  let season = await db.query.seasons.findFirst({ where: eq(schema.seasons.year, year) });
  if (!season) {
    [season] = await db
      .insert(schema.seasons)
      .values({ year, rules: RULES_2026, active: true })
      .returning();
    console.log(`Created the ${year} season.`);
  } else if (!("tiebreakOrder" in season.rules)) {
    // Backfills a season row created before `tiebreakOrder` joined Rules. The
    // other two fields are the same values that row was created with, so this
    // replaces the whole object rather than spreading a jsonb column the query
    // builder types as unknown.
    [season] = await db
      .update(schema.seasons)
      .set({ rules: RULES_2026 })
      .where(eq(schema.seasons.id, season.id))
      .returning();
    console.log(`Backfilled tiebreakOrder onto the ${year} season's Rules.`);
  } else {
    console.log(`The ${year} season already exists.`);
  }

  const commissioners = [
    { displayName: "Jonah", phone: process.env.SEED_JONAH_PHONE ?? null },
    { displayName: "Alex", phone: process.env.SEED_ALEX_PHONE ?? null },
  ];
  const base = appUrl();
  for (const input of commissioners) {
    let member = await db.query.members.findFirst({
      where: and(eq(schema.members.displayName, input.displayName), eq(schema.members.isCommissioner, true)),
    });
    if (!member) {
      member = await bootstrapCommissioner(db, input);
      console.log(`Created commissioner ${member.displayName}.`);
    }
    console.log(`${member.displayName}: ${magicLinkFor(member, base)}`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
