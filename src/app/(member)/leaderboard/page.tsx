import Link from "next/link";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { db } from "@/db";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { MemberChip } from "@/components/member-chip";
import { Pennant } from "@/components/pennant";
import { SECTION_LABEL } from "@/components/section-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMember } from "@/lib/members/current";
import { seasonResult } from "@/lib/results/results";
import {
  averageLabel,
  movement,
  record,
  weeklyWinSentence,
  weeksPlayedNote,
  type Movement,
} from "@/lib/results/summary";

/**
 * How far a member's rank moved since the board before the latest played week,
 * beside the rank it moved to. Movers only: a member who held their place
 * shows nothing, so the eye goes straight to what changed.
 *
 * Uncoloured on purpose. `win` is a light moss meant as a fill behind dark
 * text — as ink on paper it measures 3.3:1, under the 4.5:1 every pair in the
 * design notes is audited to — and colouring only the fall would say a drop
 * matters and a climb does not. The arrow carries the direction, which is the
 * rule the notes already set for win and loss: never hue alone.
 *
 * An arrow rather than a chevron because at 12px a chevron is just its head,
 * and beside a digit it reads as the caret "^" rather than as movement. The
 * stem is what makes the direction unmistakable at this size.
 */
function Move({ move }: { move: Movement }) {
  const Arrow = move.direction === "up" ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center text-xs font-bold text-foreground">
      <Arrow size={12} strokeWidth={3} aria-hidden />
      {move.places}
      <span className="sr-only">{move.label}</span>
    </span>
  );
}

/**
 * The season standings, computed on every read: nothing here is stored, so a
 * Result Override on the results console changes this table the next time it
 * is opened.
 *
 * Only Weeks whose Deadline has passed count (`playedWeeks`), so a Week in
 * progress never appears as a week everyone scored zero in.
 */
export default async function Leaderboard() {
  const member = await requireMember();
  const season = await seasonResult(db(), new Date());
  const played = season.weeks;
  const latest = played[played.length - 1];
  // Null when nobody played the latest Week, which is not the same as an empty
  // sentence: interpolating it straight into the footnote puts "null" on the board.
  const won = latest ? weeklyWinSentence(latest.weeklyWin, latest.complete) : null;
  // Movement is measured against the board before the latest played Week. With
  // one week played there is no such board, so there are no arrows to explain.
  const movedSince = played.length > 1 ? played[played.length - 2].week.weekNumber : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Leaderboard"
        sub={
          latest
            ? `${season.season.year} season · after Week ${latest.week.weekNumber}`
            : `${season.season.year} season · before the first week`
        }
        right={<MemberChip member={member} />}
      />

      <section className="px-4">
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {/* Holds a two-digit rank beside a two-digit move. `pr-0` because
                    the movement is the last thing in the cell and the Member
                    column's own left padding already separates them: with the
                    cell's default `p-2` the widest case put the table 1px over
                    its container at 390px and gave the board a scrollbar. */}
                <TableHead className="w-12 pr-0">#</TableHead>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Pts</TableHead>
                <TableHead className="text-right">W–L</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Avg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {season.leaderboard.map((row) => {
                const you = row.member.id === member.id;
                const weeks = weeksPlayedNote(row, played.length);
                const move = movement(row);
                return (
                  <TableRow key={row.member.id} className={you ? "bg-muted" : undefined}>
                    <TableCell className="pr-0 text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-0.5">
                        {row.rank}
                        {move ? <Move move={move} /> : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Pennant avatarId={row.member.avatarId} size={28} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold">{row.member.displayName}</span>
                            {you ? <span className="text-xs text-muted-foreground">you</span> : null}
                            {row.rank === 1 && latest ? (
                              <Badge className="bg-leader text-leader-foreground">
                                <Trophy size={12} aria-hidden /> <span className="sr-only">Leading the season</span>
                              </Badge>
                            ) : null}
                          </span>
                          {/* A late joiner's total is over fewer weeks; their average is the fair column. */}
                          {weeks ? <span className="block text-xs text-muted-foreground">{weeks}</span> : null}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-display text-lg font-black tabular-nums">
                      {row.totalPoints}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{record(row.correct, row.incorrect)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.weeklyWins}</TableCell>
                    <TableCell className="text-right tabular-nums">{averageLabel(row.averagePoints)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="pt-3 text-sm text-muted-foreground">
          Ties break by Weekly Wins, then by Tiebreaker Guess closeness.
          {won ? ` ${won}.` : ""}
          {movedSince ? ` Arrows are places moved since Week ${movedSince}.` : ""}
        </p>
      </section>

      {played.length > 0 ? (
        <section className="space-y-2 px-4">
          <p className={SECTION_LABEL}>Week results</p>
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {[...played].reverse().map((week) => {
              const won = weeklyWinSentence(week.weeklyWin, week.complete);
              return (
                <li key={week.week.id}>
                  <Link
                    href={`/results?week=${week.week.weekNumber}`}
                    className="flex min-h-tap items-center justify-between gap-3 p-3 no-underline"
                  >
                    <span className="font-semibold">Week {week.week.weekNumber}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {won ?? "Nobody played this week"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="mx-4 space-y-2 rounded-md border border-border bg-card p-3">
          <p className={SECTION_LABEL}>The season is young</p>
          <p className="text-muted-foreground">
            Every member starts on zero. Points land here once the first week&rsquo;s deadline has passed.
          </p>
        </section>
      )}
    </main>
  );
}
