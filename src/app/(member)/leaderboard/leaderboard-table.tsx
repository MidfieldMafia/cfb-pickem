"use client";

import { useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";
import { Badge, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";

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

const SORTABLE_COLUMNS: { column: SortColumn; label: string; tip: string }[] = [
  { column: "points", label: "Pts", tip: "Total points across every week played." },
  { column: "record", label: "W–L", tip: "Correct and incorrect picks across the season. A voided game counts as neither." },
  { column: "wins", label: "Wins", tip: "Weekly Wins: weeks you scored the most points in your group." },
  { column: "average", label: "Avg", tip: "Average points per week played." },
  {
    column: "miss",
    label: "Miss",
    tip: "Average Tiebreaker Guess miss over the weeks you guessed. Lower is better; it plays no part in ties.",
  },
];

/** How long a finger must rest on a header before it explains itself, as a long-press does on a phone. */
const LONG_PRESS_MS = 450;
const TIP_WIDTH = 176;

interface TipPlace {
  top: number;
  left: number;
}

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
  tip,
  sort,
  onSort,
}: {
  column: SortColumn;
  label: string;
  tip: string;
  sort: Sort | null;
  onSort: (column: SortColumn) => void;
}) {
  const active = sort?.column === column;
  // The arrow and `aria-sort` describe the column's *values*, not the sort
  // direction's name: `asc` is each column's best-first order (see
  // `leaderboard-sort.ts`), which for every column but Miss runs from the
  // biggest number down and for Miss from the smallest up.
  const valuesRise = active && (sort!.direction === "asc") === (column === "miss");
  const ariaSort = !active ? "none" : valuesRise ? "ascending" : "descending";
  const Direction = valuesRise ? ArrowUp : ArrowDown;

  const tipId = useId();
  const [place, setPlace] = useState<TipPlace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  function show(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - TIP_WIDTH, window.innerWidth - TIP_WIDTH - 8));
    setPlace({ top: rect.bottom + 4, left });
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlace(null);
  }

  return (
    <TableHead className="text-right" aria-sort={ariaSort}>
      {/* p-0/border-0/bg-transparent strip the UA button chrome that would
          otherwise widen every numeric column past its plain-text size — the
          table already sits 1px from its 390px container (page.tsx's own
          note on the # column), so any added width reintroduces a scrollbar. */}
      <button
        type="button"
        aria-describedby={tipId}
        onClick={() => {
          // A long-press that showed the tip is a request to read, not to sort.
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          onSort(column);
        }}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
        }}
        onBlur={hide}
        onKeyDown={(e) => e.key === "Escape" && hide()}
        onTouchStart={(e) => {
          const el = e.currentTarget;
          pressed.current = false;
          timer.current = setTimeout(() => {
            pressed.current = true;
            show(el);
          }, LONG_PRESS_MS);
        }}
        onTouchEnd={() => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          // Leave a long-press's tip up long enough to read, then take it down.
          if (pressed.current) setTimeout(hide, 2500);
        }}
        onTouchMove={() => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative -my-2 inline-flex items-center gap-0.5 border-0 bg-transparent px-0 py-2 ${active ? "font-bold text-foreground" : ""}`}
      >
        {label}
        {/* Hung in the gap to the label's left rather than set beside it: an
            inline arrow widens the column, and this table has no width to
            spare (the note above). */}
        {active ? (
          <Direction size={10} strokeWidth={3} aria-hidden className="absolute right-full top-1/2 mr-px -translate-y-1/2" />
        ) : null}
      </button>
      {/* Always in the DOM so a screen reader can read it off the button; the
          visible copy below is a sighted-user convenience and is aria-hidden. */}
      <span id={tipId} className="sr-only">
        {tip}
      </span>
      {place ? (
        <span
          aria-hidden
          style={{ top: place.top, left: place.left, width: TIP_WIDTH }}
          className="pointer-events-none fixed z-20 whitespace-normal rounded-md bg-foreground px-2 py-1.5 text-left text-xs font-normal normal-case text-background shadow-md"
        >
          {tip}
        </span>
      ) : null}
    </TableHead>
  );
}

/**
 * `championId` is the member the Trophy belongs to, decided by the page
 * (`seasonChampion`): the Trophy marks the season's winner and nobody mid-season,
 * when a mark beside whoever happens to be leading reads as a result.
 */
export function LeaderboardTable({
  rows,
  viewerId,
  championId,
}: {
  rows: LeaderboardRow[];
  viewerId: number;
  championId: number | null;
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

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 pr-0">#</TableHead>
            <TableHead>Member</TableHead>
            {SORTABLE_COLUMNS.map(({ column, label, tip }) => (
              <SortableHead key={column} column={column} label={label} tip={tip} sort={sort} onSort={toggleSort} />
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
                      {row.member.id === championId ? (
                        <Badge variant="leader">
                          <Trophy size={12} aria-hidden /> <span className="sr-only">Season champion</span>
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
