/**
 * Starting a new Season (#251). Only one Season is active at a time
 * (CONTEXT.md); starting the next makes it the one, carrying the last one's
 * Rules over, and clears everything that lasts only a Season. So far that is
 * Chat.
 *
 * Run by `npm run start-season -- <year>`; nothing in the app calls it.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { inOneBatch } from "@/db/batch";
import { seasons, type Season } from "@/db/schema";
import type { Db } from "@/db/types";
import { clearPastSeasons } from "@/lib/chat/season";
import { activeSeason, InvalidSlate } from "./slate";

/**
 * Makes `year` the active Season, creating it with the active Season's Rules
 * if it is new, then deletes the earlier Seasons' Chat. Safe to run twice:
 * starting the Season that is already active only finishes the clearing, in
 * case a first run stopped partway. Refuses to go back to an earlier year.
 */
export async function startSeason(db: Db, year: number): Promise<Season> {
  if (!Number.isInteger(year)) throw new InvalidSlate("A season is a year, like 2027.");
  const current = await activeSeason(db);
  if (year < current.year) throw new InvalidSlate(`The ${current.year} season has already started.`);
  if (year > current.year) {
    await inOneBatch(db, (tx) => [
      tx.insert(seasons).values({ year, rules: current.rules }).onConflictDoNothing({ target: seasons.year }),
      tx.update(seasons).set({ active: false }).where(eq(seasons.active, true)),
      tx.update(seasons).set({ active: true }).where(eq(seasons.year, year)),
    ]);
  }
  await clearPastSeasons(db);
  return activeSeason(db);
}
