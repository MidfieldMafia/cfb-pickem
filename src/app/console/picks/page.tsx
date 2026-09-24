import Link from "next/link";
import { db } from "@/db";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, CopyButton, LocalTime, SECTION_LABEL, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";

import { appUrl } from "@/lib/app-url";
import { requireConsole } from "@/lib/members/current";
import { NOOP, senderFromEnv } from "@/lib/messaging/sender";
import { planReminders, textBudget, UNREACHED } from "@/lib/messaging/texts";
import { owed, pickAuditsFor, reminderText, whoHasntPicked, type MemberProgress, type PickAudit } from "@/lib/picks/console";
import { plural } from "@/lib/plural";
import { consoleWeek } from "@/lib/slate/slate";
import { ActionForm } from "../action-form";
import { textRemindersAction } from "./actions";
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
  const missing = owed(row);
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Pennant avatarId={row.member.avatarId} name={row.member.displayName} size={36} />
          <span className="font-semibold">{row.member.displayName}</span>
        </div>
      </TableCell>
      <TableCell>
        <PickDots picked={row.picked} needed={needed} />
      </TableCell>
      <TableCell>
        {row.lockTeam ? (
          <Badge variant="secondary">{row.lockTeam}</Badge>
        ) : (
          <Badge variant="outline">{row.lockDropped ? "Dropped (game void)" : "Not set"}</Badge>
        )}
      </TableCell>
      <TableCell className="tabular-nums">
        {row.tiebreakerGuess === null ? <Badge variant="outline">Not set</Badge> : row.tiebreakerGuess}
      </TableCell>
      {/* `live` is the one hot orange and belongs to a game in progress; a
          member who is finished is a win, with the glyph the design notes
          require so the state does not rest on hue alone. */}
      <TableCell className="whitespace-normal">
        {row.complete ? (
          <Badge variant="win">Done</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Missing {missing.join(", ")}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {/* `asChild` renders a link, which the base layer's 44px rule does not
            reach; `tap` is how a link asks for it. */}
        <Button asChild variant="outline" size="sm">
          <Link href={`/console/picks/${row.member.id}?week=${weekNumber}`} className="tap">
            Edit picks
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default async function WhoHasntPicked({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const commissioner = await requireConsole();
  const params = await searchParams;
  const database = db();
  const { week, slate } = await consoleWeek(database, commissioner, params.week);
  const weekNumber = week.weekNumber;
  const published = slate.week.published && slate.week.deadline !== null;
  const [report, log] = published
    ? await Promise.all([whoHasntPicked(database, commissioner, week.id), pickAuditsFor(database, commissioner, week.id)])
    : [null, []];
  // What the Text button will do, planned from the same rows it sends from, so
  // the people it cannot reach are named here before anyone presses it.
  const sender = senderFromEnv();
  const budget = await textBudget(database, sender, new Date());
  const plan = report ? planReminders(report, appUrl(), budget.remaining) : null;
  const gameName = new Map(slate.games.map((g) => [g.id, `${g.awayTeam} at ${g.homeTeam}`]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1>Who hasn&apos;t picked</h1>
        <p className="text-sm text-muted-foreground">
          Week {weekNumber}
          {report ? (
            <>
              {" · "}Deadline <LocalTime at={report.deadline} style="deadline" />
            </>
          ) : null}
        </p>
      </div>

      {!report ? (
        <Card asChild className="rounded-md text-sm">
          <p role="status">
            Week {weekNumber} is not published. Members can pick, and you can enter picks for them, once the slate is out.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <Card className="gap-0 overflow-hidden rounded-md p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead variant="caps">Member</TableHead>
                    <TableHead variant="caps">Picks</TableHead>
                    <TableHead variant="caps">Lock of the Week</TableHead>
                    <TableHead variant="caps">Tiebreaker Guess</TableHead>
                    <TableHead variant="caps">Status</TableHead>
                    <TableHead variant="caps" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.members.map((row) => (
                    <Progress key={row.member.id} row={row} needed={report.needed} weekNumber={weekNumber} />
                  ))}
                  {report.members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="whitespace-normal text-muted-foreground">
                        No active members joined before the deadline.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Card>

            <Card asChild className="gap-0 rounded-md p-0">
              <section>
                <CardHeader className="border-b border-border p-3">
                  <CardTitle asChild>
                    <h2>Change log</h2>
                  </CardTitle>
                  <CardDescription>
                    Every pick, Lock, and Tiebreaker Guess a commissioner entered or changed for this week.
                  </CardDescription>
                </CardHeader>
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
            </Card>
          </div>

          <aside className="space-y-4">
            <Card asChild className="gap-0 rounded-md p-4">
              <section>
                <p className={SECTION_LABEL}>Week {weekNumber} deadline</p>
                <p className="font-display text-2xl font-black">
                  <LocalTime at={report.deadline} style="slot" />
                </p>
                <DeadlineCountdown deadline={report.deadline.toISOString()} serverNow={report.serverNow.toISOString()} />
              </section>
            </Card>
            <Card asChild className="gap-0 rounded-md p-4">
              <section>
                <p className={SECTION_LABEL}>Ready</p>
                <p className="font-display text-2xl font-black tabular-nums">
                  {report.ready} of {report.members.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  Members with every pick, a Lock of the Week, and a Tiebreaker Guess.
                </p>
              </section>
            </Card>
            <Card asChild className="gap-2 rounded-md p-4">
              <section>
                <p className={SECTION_LABEL}>Reminder</p>
                <p className="text-sm">{reminderText(report)}</p>
                <CopyButton text={reminderText(report)} label="Copy reminder" size="default" className="w-full" />
                <p className="text-xs text-muted-foreground">Paste it into the group chat.</p>
              </section>
            </Card>
            {plan ? (
              <Card asChild className="gap-2 rounded-md p-4">
                <section>
                  <p className={SECTION_LABEL}>Text reminders</p>
                  <p className="text-sm">
                    {plan.send.length === 0
                      ? "Nobody left to text."
                      : `Texts ${plan.send.map((t) => t.member.displayName).join(", ")}.`}
                  </p>
                  <ActionForm
                    action={textRemindersAction}
                    hidden={{ weekId: report!.week.id }}
                    submit={`Text ${plural(plan.send.length, "member")}`}
                    pendingLabel="Texting…"
                    variant="default"
                    size="default"
                    className="space-y-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {sender.name === NOOP
                      ? "No PINGRAM_API_KEY is set, so texts are logged but not delivered."
                      : `${budget.used} of ${budget.budget} texts used this month.`}{" "}
                    A daily reminder also goes out on its own the day the Deadline is within 24 hours.
                  </p>
                  {plan.skip.length > 0 ? (
                    <div className="space-y-2 border-t border-border pt-2">
                      <p className="text-sm font-semibold">Not reachable by text</p>
                      <ul className="text-sm text-muted-foreground">
                        {plan.skip.map(({ row, why }) => (
                          <li key={row.member.id}>
                            {row.member.displayName}: {UNREACHED[why]}
                          </li>
                        ))}
                      </ul>
                      <CopyButton
                        text={reminderText({ ...report!, members: plan.skip.map((s) => s.row) })}
                        label="Copy reminder for them"
                        size="default"
                        className="w-full"
                      />
                    </div>
                  ) : null}
                </section>
              </Card>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
