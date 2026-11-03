/**
 * The live heartbeat: an outside scheduler (Upstash QStash, see
 * `scripts/qstash-schedules.mts`) pings `/api/cron/live` once a minute during
 * game windows, so the scores move when no member has the app open. Member
 * traffic schedules the feed otherwise, and this rides the same stale gate:
 * a ping inside the 30 s claim loses it and does nothing but one read.
 *
 * The `route.ts` binds the real database, feed and `authorized()` and exports
 * this under `GET` and `POST`; a route file may export nothing else, which is
 * why the logic lives here. A test binds a PGlite database and calls it with a
 * plain `Request`.
 */
import type { Db } from "@/db/types";
import type { CfbdClient } from "@/lib/cfbd/types";
import type { CloseGameSink } from "@/lib/push/close-game";
import { publishedSlate } from "@/lib/slate/slate";
import { refreshResultsIfStale, type RefreshOutcome } from "./writes";

export interface HeartbeatRoute {
  db: Db;
  /** A factory, because building the production client reads the environment and throws without a key. */
  cfbd: () => CfbdClient;
  /** The cron check: `Authorization: Bearer $CRON_SECRET`, which QStash forwards. */
  authorized: (request: Request) => boolean;
  /** Where a ping that pulls the feed hands the games it just made close (#531). */
  closeGames?: CloseGameSink;
  /** The clock, for a test; the route leaves it to the moment of the request. */
  now?: Date;
}

/** What one ping did, for the scheduler's delivery log. `week` is null when no Week is published. */
export interface HeartbeatJson {
  week: number | null;
  refreshed: boolean;
  outcome: RefreshOutcome;
}

export async function liveHeartbeat(request: Request, route: HeartbeatRoute): Promise<Response> {
  if (!route.authorized(request)) return new Response("Unauthorized", { status: 401 });
  const now = route.now ?? new Date();
  const slate = await publishedSlate(route.db);
  if (!slate) return Response.json({ week: null, refreshed: false, outcome: "idle" } satisfies HeartbeatJson);
  const { outcome } = await refreshResultsIfStale(route.db, route.cfbd(), slate, now, route.closeGames);
  return Response.json({ week: slate.week.weekNumber, refreshed: outcome === "refreshed", outcome } satisfies HeartbeatJson);
}
