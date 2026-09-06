import { db } from "@/db";
import { integer, readBody, withPickContext } from "@/lib/picks/http";
import { toSheetJson } from "@/lib/picks/json";
import { pickSheet, savePick } from "@/lib/picks/picks";

/** The signed-in member's pick sheet for the published Week, with the server clock. */
export async function GET() {
  return withPickContext(async ({ actor, weekId, now }) =>
    Response.json(toSheetJson(await pickSheet(db(), actor, weekId, now))),
  );
}

/** Saves one Pick: `{ gameId, teamId }`. Replaces any earlier pick in that game. */
export async function PUT(request: Request) {
  const body = await readBody(request);
  return withPickContext(async ({ actor, now }) => {
    const pick = await savePick(db(), actor, integer(body, "gameId"), integer(body, "teamId"), now);
    return Response.json({
      pick: { gameId: pick.gameId, teamId: pick.teamId, updatedAt: pick.updatedAt.toISOString() },
      serverNow: now.toISOString(),
    });
  });
}
