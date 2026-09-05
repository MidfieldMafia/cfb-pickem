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
import { bootstrapCommissioner, magicLinkFor } from "../src/lib/members/members";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `npx vercel env pull .env.local` first.");
  process.exit(1);
}
const db = drizzle({ client: neon(url), schema });

async function main() {
  const year = 2026;
  let season = await db.query.seasons.findFirst({ where: eq(schema.seasons.year, year) });
  if (!season) {
    [season] = await db
      .insert(schema.seasons)
      .values({ year, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2 }, active: true })
      .returning();
    console.log(`Created the ${year} season.`);
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
