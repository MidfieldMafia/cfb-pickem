import Link from "next/link";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { LocalTime } from "@/components/local-time";
import { Pennant } from "@/components/pennant";
import { SECTION_LABEL } from "@/components/section-label";
import { requireConsole } from "@/lib/members/current";
import { owed, pickAuditsFor, reminderText, whoHasntPicked, type MemberProgress, type PickAudit } from "@/lib/picks/console";
import { activeSeason, openWeek, seasonWeeks, slateFor, WEEK_NUMBERS } from "@/lib/slate/slate";
import { requestedWeekNumber } from "../week-param";
import { choosePicksWeekAction } from "./actions";
import { DeadlineCountdown } from "./deadline-countdown";

const KINDS: Record<PickAudit["kind"], string> = {
  pick: "pick",
  lock: "Lock of the Week",
  tiebreaker_guess: "Tiebreaker Guess",
};

function PickDots({ picked, needed }: { picked: number; needed: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-flex gap-0.5">
        {Array.from({ length: needed }, (_, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-sm ${i < picked ? "bg-primary" : "bg-muted"}`} />
        ))}
      </span>
      <span className="tabular-nums">
        {picked} of {needed}
      </span>
    </span>
  );
}

function Progress({ row, needed, weekNumber }: { row: MemberProgress; needed: number; weekNumber: number }) {
  const missing = owed(row, needed);
  return (
    <tr className="align-middle">
      <td className="p-3">
        <div className="flex items-center gap-3">
          <Pennant avatarId={row.member.avatarId} size={36} />
          <span className="font-semibold">{row.member.displayName}</span>
        </div>
      </td>
      <td className="p-3 whitespace-nowrap">
        <PickDots picked={row.picked} needed={needed} />
      </td>
      <td className="p-3">
        {row.lockTeam ? (
          <Badge className="bg-secondary text-secondary-foreground">{row.lockTeam}</Badge>
        ) : (
          <Badge variant="outline">{row.lockDropped ? "Dropped (game void)" : "Not set"}</Badge>
        )}
      </td>
      <td className="p-3 tabular-nums">
        {row.tiebreakerGuess === null ? <Badge variant="outline">Not set</Badge> : row.tiebreakerGuess}
      </td>
      <td className="p-3">
        {row.complete ? (
          <Badge className="bg-live text-live-foreground">Done</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Missing {missing.join(", ")}</span>
        )}
      </td>
      <td className="p-3 text-right">
        <Button asChild variant="outline" size="sm">
          <Link href={`/console/picks/${row.member.id}?week=${weekNumber}`}>Edit picks</Link>
        </Button>
      </td>
    </tr>
  );
}

export default async function WhoHasntPicked({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const commissioner = await requireConsole();
  const params = await searchParams;
  const database = db();
  const season = await activeSeason(database);
  const existing = await seasonWeeks(database, season);
  const weekNumber = requestedWeekNumber(existing, params.week);
  const week = await openWeek(database, commissioner, weekNumber, season);
  const slate = await slateFor(database, week.id);
  const published = slate.week.published && slate.week.deadline !== null;
  const [report, log] = published
    ? await Promise.all([whoHasntPicked(database, commissioner, week.id), pickAuditsFor(database, commissioner, week.id)])
    : [null, []];
  const gameName = new Map(slate.games.map((g) => [g.id, `${g.awayTeam} at ${g.homeTeam}`]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Who hasn&apos;t picked</h1>
          <p className="text-sm text-muted-foreground">
            {season.year} · Week {weekNumber}
            {report ? (
              <>
                {" · "}Deadline <LocalTime at={report.deadline} style="deadline" />
              </>
            ) : null}
          </p>
        </div>
        <form action={choosePicksWeekAction} className="flex items-center gap-2 text-sm font-semibold">
          Week
          <select
            name="weekNumber"
            defaultValue={weekNumber}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm"
          >
            {WEEK_NUMBERS.map((n) => (
              <option key={n} value={n}>
                {n}
                {existing.find((w) => w.weekNumber === n)?.published ? " · published" : ""}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      </div>

      {!report ? (
        <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">
          Week {weekNumber} is not published. Members can pick, and you can enter picks for them, once the slate is out.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="p-3">Member</th>
                    <th className="p-3">Picks</th>
                    <th className="p-3">Lock of the Week</th>
                    <th className="p-3">Tiebreaker Guess</th>
                    <th className="p-3">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.members.map((row) => (
                    <Progress key={row.member.id} row={row} needed={report.needed} weekNumber={weekNumber} />
                  ))}
                  {report.members.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-3 text-muted-foreground">
                        No active members joined before the deadline.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <section className="rounded-md border border-border bg-card">
              <div className="border-b border-border p-3">
                <h2>Change log</h2>
                <p className="text-sm text-muted-foreground">
                  Every pick, Lock, and Tiebreaker Guess a commissioner entered or changed for this week.
                </p>
              </div>
              <ul className="divide-y divide-border">
                {log.map((entry) => (
                  <li key={entry.id} className="p-3 text-sm">
                    <p>
                      <span className="font-semibold">{entry.changedByName}</span> changed{" "}
                      <span className="font-semibold">{entry.memberName}</span>&apos;s {KINDS[entry.kind]}
                      {entry.kind === "pick" && entry.gameId !== null ? ` in ${gameName.get(entry.gameId) ?? "a game"}` : ""}
                      : {entry.previousValue ?? "not set"} → {entry.newValue ?? "not set"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <LocalTime at={entry.changedAt} />
                    </p>
                  </li>
                ))}
                {log.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No changes yet.</li> : null}
              </ul>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-md border border-border bg-card p-4">
              <p className={SECTION_LABEL}>Week {weekNumber} deadline</p>
              <p className="font-display text-2xl font-black">
                <LocalTime at={report.deadline} style="slot" />
              </p>
              <DeadlineCountdown deadline={report.deadline.toISOString()} serverNow={report.serverNow.toISOString()} />
            </section>
            <section className="rounded-md border border-border bg-card p-4">
              <p className={SECTION_LABEL}>Ready</p>
              <p className="font-display text-2xl font-black tabular-nums">
                {report.ready} of {report.members.length}
              </p>
              <p className="text-sm text-muted-foreground">
                Members with every pick, a Lock of the Week, and a Tiebreaker Guess.
              </p>
            </section>
            <section className="space-y-2 rounded-md border border-border bg-card p-4">
              <p className={SECTION_LABEL}>Reminder</p>
              <p className="text-sm">{reminderText(report)}</p>
              <CopyButton text={reminderText(report)} label="Copy reminder" size="default" className="w-full" />
              <p className="text-xs text-muted-foreground">Paste it into the group chat. Automated texts come later.</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
