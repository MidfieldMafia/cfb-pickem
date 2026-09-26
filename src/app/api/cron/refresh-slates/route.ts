import { db } from "@/db";
import { cfbd } from "@/lib/cfbd";
import { refreshUpcomingSlates } from "@/lib/slate/slate";
import { openMeteo } from "@/lib/weather/open-meteo";
import { authorized } from "../auth";

/**
 * The daily slate refresh (see `vercel.json`): every Week with a game not yet
 * kicked off re-reads the feed, so the pick screen and the Game sheet show
 * this morning's detail, spread and ranks. It runs at 12:00 UTC, before
 * Saturday's first kickoffs, and a game already kicked off is left alone.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json({ weeks: await refreshUpcomingSlates(db(), cfbd(), openMeteo()) });
}
