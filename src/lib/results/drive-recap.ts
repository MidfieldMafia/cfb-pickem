/**
 * The recap line under Recent plays: the **previous drive**, the one just
 * before the newest in the feed, as `LIB · Touchdown · 8 plays, 80 yds, 1:08`.
 * Recent plays lists the newest drive's plays, and a line on that drive would
 * last only until the kickoff or punt that opens the next one, so the line
 * recaps the drive before it.
 *
 * The rules are the resolution of "Does Recent plays close a drive with a
 * recap line?" (#314). The numbers are the feed's own, as they come: a null
 * part is left out, never worked out from the plays, because `yardsGained` is
 * not signed movement.
 *
 * Built at read time from the stored drives, like the play descriptions in
 * `field.ts`. Pure and free of database imports.
 */
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import type { FieldTeams, Side } from "./field";

export interface DriveRecap {
  /** The recapped drive's id in the feed. */
  driveId: string;
  /** The drive's offense, labelled by the screen as the scoring-play tag is. Null when the feed named neither team. */
  side: Side | null;
  /** "Touchdown", "Turnover on downs"… Null when the feed gave none. */
  result: string | null;
  /** "8 plays, 80 yds, 1:08": the feed's numbers, a null one left out. Null when it gave none. */
  stats: string | null;
}

/** A drive as the recap reads it; every number may be missing from the feed. */
type RecappedDrive = Pick<CfbdLiveDrive, "id" | "offenseId" | "result"> & {
  playCount: number | null;
  yards: number | null;
  duration: string | null;
};

/** The previous drive's recap. Null before the game's second drive. */
export function recapPreviousDrive(drives: readonly RecappedDrive[], teams: FieldTeams): DriveRecap | null {
  const drive = drives.at(-2);
  if (!drive) return null;
  const side = drive.offenseId === teams.homeTeamId ? "home" : drive.offenseId === teams.awayTeamId ? "away" : null;
  const parts = [
    drive.playCount == null ? null : count(drive.playCount, "play", "plays"),
    drive.yards == null ? null : count(drive.yards, "yd", "yds"),
    drive.duration || null,
  ].filter((part) => part !== null);
  return { driveId: drive.id, side, result: driveResult(drive.result), stats: parts.join(", ") || null };
}

/** The feed's `result`, relabelled for the league. The one quarter end a drive shows is the game's last. */
const RESULTS: Record<string, string> = {
  downs: "Turnover on downs",
  "end of quarter": "End of game",
};

/** A drive's result as the line shows it: known ones relabelled, any other in sentence case, none for blank. */
export function driveResult(result: string): string | null {
  const text = result.trim().toLowerCase();
  if (!text) return null;
  return RESULTS[text] ?? text[0].toUpperCase() + text.slice(1);
}

/** "1 play", "8 plays", "−9 yds": singular only for exactly one, a true minus sign for a negative. */
function count(n: number, one: string, many: string): string {
  return `${n < 0 ? `−${-n}` : n} ${n === 1 ? one : many}`;
}
