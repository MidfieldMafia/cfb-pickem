import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { dataDir } from "@electric-sql/pglite-prepopulatedfs";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * The migrations applied once, then kept as a data directory to copy. Running
 * them per test is what a server-seam suite spends its time on, and there are
 * enough of those now that it showed up as timeouts rather than as slowness.
 * One dump per test file (each file gets fresh modules); every test still gets
 * its own database.
 *
 * The template starts from PGlite's prebuilt data directory rather than
 * running initdb. initdb is the expensive step, not the migrations: with
 * sixteen files building templates at once it took a median 13s against 1.9s
 * prebuilt, and a file's first test, which pays for it, hit the 20s timeout
 * whenever another suite or a build shared the machine. The prebuilt directory
 * only fits the PGlite release it was built from, so both packages are pinned
 * to the same exact version in package.json; bump them together.
 */
let migrated: Promise<Blob | File> | undefined;

function template(): Promise<Blob | File> {
  migrated ??= (async () => {
    const client = await PGlite.create({ loadDataDir: await dataDir() });
    await migrate(drizzle({ client, schema }), { migrationsFolder: "drizzle" });
    // Uncompressed: this never leaves memory, and gzipping it costs more than the copy saves.
    const dump = await client.dumpDataDir("none");
    await client.close();
    return dump;
  })();
  return migrated;
}

/**
 * A fresh in-process Postgres with the committed migrations applied, so
 * server-seam tests run the same SQL that deploys to Neon.
 */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite({ loadDataDir: await template() });
  return drizzle({ client, schema });
}

/**
 * A copy of the committed migrations that stops at `lastTag`, for a database
 * as it stood then. Migrating to this, writing rows, then migrating the real
 * folder runs the later migrations over those rows, which is how a data
 * migration's backfill is tested.
 */
export function migrationsThrough(lastTag: string): string {
  const folder = mkdtempSync(join(tmpdir(), "migrations-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last < 0) throw new Error(`No migration ${lastTag}`);
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, last + 1) }));
  return folder;
}
