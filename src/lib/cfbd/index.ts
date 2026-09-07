import { requireEnv } from "@/lib/env";
import { cachingCfbd, type CachingCfbdClient } from "./cache";
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
  return httpCfbd(requireEnv("CFBD_API_KEY"));
}

let cached: CachingCfbdClient | undefined;

/**
 * The one production entry to the feed: HTTP with the env key, behind the
 * shared ten-minute cache. There is no second import that reaches the API —
 * whether a call costs quota is this argument, visible at the call site,
 * rather than which module a screen happened to import from.
 */
export function cfbd(options?: { bypassCache?: false }): CachingCfbdClient;
export function cfbd(options: { bypassCache: true }): CfbdClient;
export function cfbd(options: CfbdOptions = {}): CfbdClient {
  if (options.bypassCache) return cfbdFromEnv();
  if (!cached) cached = cachingCfbd(cfbdFromEnv(), TEN_MINUTES);
  return cached;
}
