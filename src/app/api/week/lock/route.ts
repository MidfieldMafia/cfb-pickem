import { db } from "@/db";
import { integer, readBody, withPickContext } from "@/lib/picks/http";
import { setLock } from "@/lib/picks/picks";

/** Sets the Lock of the Week: `{ gameId }`, or `{ gameId: null }` for no Lock this week. */
export async function PUT(request: Request) {
  const body = await readBody(request);
  return withPickContext(async ({ actor, weekId, now }) => {
    const gameId = body.gameId === null ? null : integer(body, "gameId");
    await setLock(db(), actor, weekId, gameId, now);
    return Response.json({ lockGameId: gameId, serverNow: now.toISOString() });
  });
}
