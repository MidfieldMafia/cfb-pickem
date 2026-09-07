import { requireEnv } from "@/lib/env";
import { sharedFeed, type SharedFeed } from "./cache";
import { httpCfbd } from "./http";
import type { CfbdClient } from "./types";

const TEN_MINUTES = 10 * 60 * 1000;

/** The live client, keyed from the environment. Throws if the key is missing. */
function cfbdFromEnv(): CfbdClient {
  return httpCfbd(requireEnv("CFBD_API_KEY"));
}

let feed: SharedFeed | undefined;

function doors(): SharedFeed {
  if (!feed) feed = sharedFeed(cfbdFromEnv(), TEN_MINUTES);
  return feed;
}

/**
 * The one production entry to the feed: HTTP with the env key, behind the
 * shared ten-minute cache. There is no second import that reaches the API, and
 * no uncached one either — a read that must go through goes through
 * `freshCfbd`, which is this same cache emptied rather than a client beside it.
 */
export function cfbd(): CfbdClient {
  return doors().cfbd();
}

/**
 * The commissioner's refresh buttons: the shared client with its cache
 * cleared, so the read costs quota and reaches CollegeFootballData now, and
 * what it brings back is what everyone else reads until it expires. See
 * `sharedFeed` for why it must be the same client and not one beside it.
 */
export function freshCfbd(): CfbdClient {
  return doors().freshCfbd();
}
