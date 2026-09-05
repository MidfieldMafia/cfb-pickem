import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import type { Db } from "./types";

let cached: Db | undefined;

/** Request-scoped Neon HTTP client. Lazy so importing the module never needs env. */
export function db(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set; run `vercel env pull .env.local`.");
    cached = drizzle({ client: neon(url), schema });
  }
  return cached;
}

export { schema };
export type { Db };
