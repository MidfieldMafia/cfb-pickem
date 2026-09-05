import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * The database handle every server module takes as its first argument.
 * Production passes the Neon HTTP client; tests pass an in-process PGlite.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
