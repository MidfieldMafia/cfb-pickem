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
import type { GamePlaysJson } from "./live-feed";

/** One Slate game's stored plays. Null for a game the Slate does not have, so no other Week's feed is reachable. */
export async function gamePlays(db: Db, slate: Slate, gameId: number): Promise<GamePlaysJson | null> {
  if (!slate.games.some((game) => game.id === gameId)) return null;
  const row = await db.query.liveFeeds.findFirst({ where: eq(liveFeeds.gameId, gameId) });
  return { gameId, fetchedAt: row?.fetchedAt.toISOString() ?? null, drives: row?.drives ?? [] };
}
