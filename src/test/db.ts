import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * A fresh in-process Postgres with the committed migrations applied, so
 * server-seam tests run the same SQL that deploys to Neon.
 */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
