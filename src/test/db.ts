import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * The migrations applied once, then kept as a data directory to copy. Running
 * them per test is what a server-seam suite spends its time on, and there are
 * enough of those now that it showed up as timeouts rather than as slowness.
 * One dump per worker process; every test still gets its own database.
 */
let migrated: Promise<Blob | File> | undefined;

function template(): Promise<Blob | File> {
  migrated ??= (async () => {
    const client = new PGlite();
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
