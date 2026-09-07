import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";
import type { Db } from "./types";

let cached: Db | undefined;

/** Request-scoped Neon HTTP client. Lazy so importing the module never needs env. */
export function db(): Db {
  if (!cached) cached = drizzle({ client: neon(requireEnv("DATABASE_URL")), schema });
  return cached;
}

export { schema };
export type { Db };
