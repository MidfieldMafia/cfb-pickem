import { db } from "@/db";
import { cfbd } from "@/lib/cfbd";
import { closeGamesAfter } from "@/lib/push/close-game-after";
import { liveHeartbeat } from "@/lib/results/heartbeat";
import { authorized } from "../auth";

/**
 * The live heartbeat (see `src/lib/results/heartbeat.ts`): Upstash QStash pings
 * it once a minute in game windows, from the schedules
 * `scripts/qstash-schedules.mts` creates. QStash sends POST by default; GET is
 * here for a manual `curl` or any other cron.
 */
export async function POST(request: Request) {
  return liveHeartbeat(request, { db: db(), cfbd, authorized, closeGames: closeGamesAfter });
}

export async function GET(request: Request) {
  return liveHeartbeat(request, { db: db(), cfbd, authorized, closeGames: closeGamesAfter });
}
