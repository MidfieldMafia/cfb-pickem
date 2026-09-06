import { cachingCfbd } from "./cache";
import { httpCfbd } from "./http";
import type { CfbdClient } from "./types";

const TEN_MINUTES = 10 * 60 * 1000;

export interface CfbdOptions {
  /**
   * Go straight to CollegeFootballData, skipping the shared cache. Every read
   * costs monthly quota, so this is for the commissioner pressing a button and
   * waiting on the answer — never for member traffic.
   */
  bypassCache?: boolean;
}

/** The live client, keyed from the environment. Throws if the key is missing. */
function cfbdFromEnv(): CfbdClient {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) throw new Error("CFBD_API_KEY is not set; run `vercel env pull .env.local`.");
  return httpCfbd(apiKey);
}

let cached: (CfbdClient & { invalidate(): void }) | undefined;

/**
 * The one production entry to the feed: HTTP with the env key, behind the
 * shared ten-minute cache. There is no second import that reaches the API —
 * whether a call costs quota is this argument, visible at the call site,
 * rather than which module a screen happened to import from.
 */
export function cfbd(options?: { bypassCache?: false }): CfbdClient & { invalidate(): void };
export function cfbd(options: { bypassCache: true }): CfbdClient;
export function cfbd(options: CfbdOptions = {}): CfbdClient {
  if (options.bypassCache) return cfbdFromEnv();
  if (!cached) cached = cachingCfbd(cfbdFromEnv(), TEN_MINUTES);
  return cached;
}
