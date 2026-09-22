import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { Db } from "./types";

type Writes = readonly [BatchItem<"pg">, ...BatchItem<"pg">[]];

/**
 * Runs several writes so that they all land or none do. The Neon HTTP driver
 * has no interactive transactions, only `batch`, which sends the statements
 * as one request and runs them in one transaction on the server. PGlite, which
 * the tests run on, has no `batch`, so there the same writes run inside a
 * transaction instead. `writes` builds its statements on the handle it is
 * given, so on that path they run inside the transaction and not beside it.
 */
export async function inOneBatch<T extends Writes>(db: Db, writes: (db: Db) => T): Promise<BatchResponse<T>> {
  if (hasBatch<T>(db)) return db.batch(writes(db));
  return db.transaction(async (tx) => {
    const results: unknown[] = [];
    for (const write of writes(tx)) results.push(await write);
    return results as BatchResponse<T>;
  });
}

function hasBatch<T extends Writes>(db: Db): db is Db & { batch: (items: T) => Promise<BatchResponse<T>> } {
  return typeof (db as { batch?: unknown }).batch === "function";
}
