/**
 * Runs the live heartbeat's schedule sync by hand (#546): the same sync the
 * daily `refresh-slates` cron and the slate console's edits run, against
 * production's published Slate. It fits the QStash schedules on
 * `/api/cron/live` to that Slate's Game windows (see `docs/agents/heartbeat.md`)
 * and deletes every other schedule there. Use it to repair the schedules after
 * a `CRON_SECRET` rotation or a failed sync.
 *
 *   npx tsx --conditions=react-server --env-file=.env.qstash scripts/qstash-schedules.mts
 *
 * Reads production's `DATABASE_URL`, `QSTASH_TOKEN` and `CRON_SECRET`, and
 * optionally `QSTASH_URL` (the Marketplace sets it; defaults to the global
 * endpoint) and `HEARTBEAT_BASE_URL` (defaults to production). It prints what
 * it did and never prints the secret or the token. Exits 1 on a failed sync,
 * having deleted nothing after the call that failed.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { requireEnv } from "../src/lib/env";
import { heartbeatConfig, PRODUCTION_ORIGIN, syncSchedules } from "../src/lib/results/heartbeat-sync";
import { publishedSlate } from "../src/lib/slate/slate";

const config = heartbeatConfig(process.env, process.env.HEARTBEAT_BASE_URL?.trim() || PRODUCTION_ORIGIN);
if (typeof config === "string") {
  console.error(`${config}.`);
  process.exit(1);
}

const db = drizzle({ client: neon(requireEnv("DATABASE_URL")), schema });
const slate = await publishedSlate(db);
console.log(slate ? `Week ${slate.week.weekNumber} is published, ${slate.games.length} games.` : "No Week is published.");

const result = await syncSchedules(slate?.games ?? [], config, { log: console.log });
if (result.status !== "synced") process.exit(1);
console.log(`${result.created.length + result.replaced.length} schedules ping ${config.destination}.`);
