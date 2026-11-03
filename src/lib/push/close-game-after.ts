/**
 * The app's `CloseGameSink` (#531): every feed update that refreshes scores
 * hands its newly close games here, and the pushes go in Next's `after()`,
 * once the response has gone. Kept apart from `close-game.ts` so the suites
 * that run the rule and the send never load `next/server`.
 */
import "server-only";
import { after } from "next/server";
import { pushCloseGames, type CloseGameSink } from "./close-game";
import { pusherFromEnv } from "./sender";

export const closeGamesAfter: CloseGameSink = (db, closes) => {
  const pusher = pusherFromEnv();
  if (!pusher) return;
  after(async () => {
    try {
      const sent = await pushCloseGames(db, pusher, closes);
      console.info(`Close game push: ${closes.map((c) => c.game.id).join(", ")} to ${sent.length} members.`);
    } catch (error) {
      console.warn("Close game push skipped:", error instanceof Error ? error.message : error);
    }
  });
};
