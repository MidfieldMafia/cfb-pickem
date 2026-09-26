/**
 * The Game sheet's read of a game's live play-by-play: what the stale gate's
 * last fetch stored, from Neon and nowhere else. A phone polling this never
 * reaches CollegeFootballData; `ingestResults` is the only thing that does.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { liveFeeds } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Slate } from "@/lib/slate/slate";
import { finalStats } from "./box-scores";
import { describePlays } from "./field";
import { newestPlay, type GamePlaysJson } from "./live-feed";

/**
 * One Slate game's stored plays, each with its drawable description, and its
 * box score once it is final. Null for
 * a game the Slate does not have, so no other Week's feed is reachable.
 *
 * The newest play reads the game header's next snap from the Game's row, but
 * only while that row's slice names the same play: the slice and the stored
 * plays are written by one fetch, and a slice cleared at the final, or left
 * behind by a failed write, must not place a play it was not read with.
 */
export async function gamePlays(db: Db, slate: Slate, gameId: number): Promise<GamePlaysJson | null> {
  const game = slate.games.find((candidate) => candidate.id === gameId);
  if (!game) return null;
  const row = await db.query.liveFeeds.findFirst({ where: eq(liveFeeds.gameId, gameId) });
  const drives = row?.drives ?? [];
  const slice = game.liveFeed;
  const header = slice && slice.play.id === newestPlay(drives)?.id ? slice : null;
  return {
    gameId,
    fetchedAt: row?.fetchedAt.toISOString() ?? null,
    drives,
    descriptions: describePlays(
      drives.flatMap((drive) => drive.plays),
      game,
      header,
    ),
    final: await finalStats(db, game),
  };
}
