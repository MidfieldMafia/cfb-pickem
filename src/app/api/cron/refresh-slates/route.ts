import { db } from "@/db";
import { cfbd } from "@/lib/cfbd";
import { syncHeartbeat } from "@/lib/results/heartbeat-sync";
import { refreshUpcomingSlates } from "@/lib/slate/slate";
import { openMeteo } from "@/lib/weather/open-meteo";
import { authorized } from "../auth";

/**
 * The daily slate refresh (see `vercel.json`): every Week with a game not yet
 * kicked off re-reads the feed, so the pick screen and the Game sheet show
 * this morning's detail, spread and ranks. It runs at 12:00 UTC, before
 * Saturday's first kickoffs, and a game already kicked off is left alone.
 *
 * Then it fits the live heartbeat's QStash schedules to the published Slate's
 * kickoffs as they now stand, catching a time the feed moved or a TBD that got
 * set (#546). The sync never throws; its result is in the response, for the
 * Vercel cron log.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const database = db();
  const weeks = await refreshUpcomingSlates(database, cfbd(), openMeteo());
  return Response.json({ weeks, heartbeat: await syncHeartbeat(database) });
}
