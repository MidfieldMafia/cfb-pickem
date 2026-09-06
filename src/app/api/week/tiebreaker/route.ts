import { db } from "@/db";
import { integer, readBody, withPickContext } from "@/lib/picks/http";
import { setTiebreakerGuess } from "@/lib/picks/picks";

/** Records the Tiebreaker Guess: `{ guess }`, the predicted combined final score. */
export async function PUT(request: Request) {
  const body = await readBody(request);
  return withPickContext(async ({ actor, weekId, now }) => {
    const guess = integer(body, "guess");
    await setTiebreakerGuess(db(), actor, weekId, guess, now);
    return Response.json({ tiebreakerGuess: guess, serverNow: now.toISOString() });
  });
}
