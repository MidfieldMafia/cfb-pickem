"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Pennant } from "@/components/pennant";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeaderboardRow } from "@/lib/results/results";
import { averageLabel, movement, record, tiebreakerMissLabel, type Movement } from "@/lib/results/summary";
import { sortLeaderboard, type SortColumn, type SortDirection } from "./leaderboard-sort";

/**
 * How far a member's rank moved since the board before the latest played week,
 * beside the rank it moved to. Movers only: a member who held their place
 * shows nothing, so the eye goes straight to what changed.
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

interface Sort {
  column: SortColumn;
  direction: SortDirection;
}

const SORTABLE_COLUMNS: { column: SortColumn; label: React.ReactNode }[] = [
  { column: "points", label: "Pts" },
  { column: "record", label: "W–L" },
  { column: "wins", label: "Wins" },
  { column: "average", label: "Avg" },
  {
    column: "miss",
    label: (
      <>
        Miss <ArrowDown className="inline" size={10} strokeWidth={3} aria-hidden />
        <span className="sr-only"> (lower is better)</span>
      </>
    ),
  },
];

/**
 * A sortable column header: a real button so a tap anywhere in the cell
 * toggles the sort (44px min-height comes free from the app-wide `button`
 * rule in globals.css), with `aria-sort` on the `<th>` itself per the ARIA
 * table-sorting pattern — a screen reader is told the column's state, not
 * the button's.
 */
function SortableHead({
  column,
  label,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: React.ReactNode;
  sort: Sort | null;
  onSort: (column: SortColumn) => void;
}) {
  const active = sort?.column === column;
  const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHead className="text-right" aria-sort={ariaSort}>
      {/* p-0/border-0/bg-transparent strip the UA button chrome that would
          otherwise widen every numeric column past its plain-text size — the
          table already sits 1px from its 390px container (page.tsx's own
          note on the # column), so any added width reintroduces a scrollbar. */}
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-my-2 inline-flex items-center gap-0.5 border-0 bg-transparent px-0 py-2 ${active ? "font-bold text-foreground" : ""}`}
      >
        {label}
      </button>
    </TableHead>
  );
}

/**
 * Who the Trophy belongs to: the one member out in front, and only once the
 * group has a Played Week behind them.
 *
 * Both halves are load-bearing, and the board a new group opens on is what
 * proves it. Nobody there has played a Week — the group was started after the
 * last Deadline — so every row is level on points, Weekly Wins and Tiebreaker
 * error, `rank` ties them all at 1 (see `compareSeason` in `score-season.ts`),
 * and a rank-1 test alone hands every member a Trophy. The same happens inside
 * a Week that has begun: until a game goes final the whole board sits at zero.
 *
 * So a shared first place gets no Trophy at all. It is the honest answer —
 * nobody is leading a board that is level — and it is the only rule that
 * cannot degenerate into crowning everyone. `weeksPlayed` then covers the case
 * the tie test cannot see: a group of one, alone at rank 1 before a Week has
 * ever counted.
 */
function trophyHolder(rows: LeaderboardRow[]): number | null {
  const leaders = rows.filter((row) => row.rank === 1);
  if (leaders.length !== 1 || leaders[0].weeksPlayed === 0) return null;
  return leaders[0].member.id;
}

export function LeaderboardTable({
  rows,
  viewerId,
}: {
  rows: LeaderboardRow[];
  viewerId: number;
}) {
  // Reinitialized on every mount, so leaving the screen and coming back — a
  // reload — always starts from the default order (#134).
  const [sort, setSort] = useState<Sort | null>(null);

  function toggleSort(column: SortColumn) {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }

  const displayed = sort ? sortLeaderboard(rows, sort.column, sort.direction) : rows;
  // Read off the board, not the sorted view: sorting by a column reorders the
  // rows without changing anyone's rank, so the Trophy stays with the same member.
  const trophy = trophyHolder(rows);

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 pr-0">#</TableHead>
            <TableHead>Member</TableHead>
            {SORTABLE_COLUMNS.map(({ column, label }) => (
              <SortableHead key={column} column={column} label={label} sort={sort} onSort={toggleSort} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayed.map((row) => {
            const you = row.member.id === viewerId;
            const move = movement(row);
            return (
              <TableRow key={row.member.id} data-member-id={row.member.id} className={you ? "bg-muted" : undefined}>
                <TableCell className="pr-0 text-muted-foreground tabular-nums">
                  <span className="flex items-center gap-0.5">
                    {row.rank}
                    {move ? <Move move={move} /> : null}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Pennant avatarId={row.member.avatarId} name={row.member.displayName} size={28} />
                    {/* min-w-0 is what lets the name truncate rather than widen the column. */}
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold">{row.member.displayName}</span>
                      {you ? <span className="text-xs text-muted-foreground">you</span> : null}
                      {row.member.id === trophy ? (
                        <Badge variant="leader">
                          <Trophy size={12} aria-hidden /> <span className="sr-only">Leading the season</span>
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-right font-display text-lg font-black tabular-nums">
                  {row.totalPoints}
                </TableCell>
                <TableCell className="text-right tabular-nums">{record(row.correct, row.incorrect)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.weeklyWins}</TableCell>
                <TableCell className="text-right tabular-nums">{averageLabel(row.averagePoints)}</TableCell>
                <TableCell className="text-right tabular-nums">{tiebreakerMissLabel(row.averageTiebreakerMiss)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
