import { cachingCfbd } from "./cache";
import { cfbdFromEnv } from "./http";
import type { CfbdClient } from "./types";

const TEN_MINUTES = 10 * 60 * 1000;

let cached: (CfbdClient & { invalidate(): void }) | undefined;

/** The production client: HTTP with the env key, behind the shared ten-minute cache. */
export function cfbd(): CfbdClient & { invalidate(): void } {
  if (!cached) cached = cachingCfbd(cfbdFromEnv(), TEN_MINUTES);
  return cached;
}
