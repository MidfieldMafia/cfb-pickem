"use client";

import Link from "next/link";
import { Calendar, Eye, Lock, LockOpen, MapPin, Radio, Scale, Tv } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  LocalTime,
} from "@saturday-slate/design-system";

import { Football } from "@/components/football";
import { Pennant } from "@/components/pennant";
import { WeatherPill } from "@/components/picks/weather-pill";
import { TeamLogo } from "@/components/team-logo";

import type { GamePlaysJson } from "@/lib/results/live-feed";
import { recentPlays, type RecentPlays } from "@/lib/results/recent-plays";
import { clockLabel } from "@/lib/results/result";
import type { RevealPick, ScoredMember, WeeklyScore } from "@/lib/results/results";
import { sideStanding, type Side, type SideStanding } from "@/lib/results/side";
import { plural } from "@/lib/plural";
import { fetchGamePlays } from "@/lib/week/client";
import type { LiveGameJson, OwnPickJson } from "@/lib/week/json";
import { kickoffDay, kickoffLine, kickoffTime } from "@/lib/week/kickoff";

import { FieldCard, useFieldPlayer } from "./field-card";

/** How often an open sheet asks for a live game's plays: the ingest's own cadence on the stale gate (#269). */
const PLAYS_POLL_MS = 30_000;
/** How long each point of a score change takes to count up (#265). */
const COUNT_STEP_MS = 145;

/**
 * A live game's stored plays, asked for when the sheet opens and every 30 s
 * after, carrying the ETag so an unchanged feed is a 304. Mounted only while
 * the sheet shows this game, so closing it stops the polling; so does the
 * game going final, when `live` turns false. A hidden tab stops asking and
 * asks again the moment it is back, as the week state's poll does.
 */
function useGamePlays(gameId: number, live: boolean): GamePlaysJson | null {
  const [plays, setPlays] = useState<GamePlaysJson | null>(null);
  const etag = useRef<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      // A hidden tab does not poll; `visibilitychange` picks it up on return.
      if (document.visibilityState === "hidden") return;
      const result = await fetchGamePlays(gameId, etag.current);
      if (cancelled) return;
      if (result.kind === "fresh") {
        etag.current = result.etag;
        setPlays(result.plays);
      }
      timer = setTimeout(() => void poll(), PLAYS_POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gameId, live]);

  return live ? plays : null;
}

/**
 * A score that counts to its new value one point at a time rather than
 * jumping: every change, touchdown or safety, at a steady 145 ms a point. The
 * first value shows as it is, so opening the sheet never counts.
 */
function useCountUp(target: number): { shown: number; counting: boolean } {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (shown === target) return;
    const timer = setTimeout(() => setShown((s) => s + Math.sign(target - s)), COUNT_STEP_MS);
    return () => clearTimeout(timer);
  }, [shown, target]);
  return { shown, counting: shown !== target };
}

const subscribeNever = () => () => {};

/**
 * A kickoff label in the viewer's own zone. The server renders UTC and the
 * browser swaps in local time on hydration, as `LocalTime` does.
 */
function useLocalLabel(format: (timeZone?: string) => string): string {
  return useSyncExternalStore(
    subscribeNever,
    () => format(),
    () => format("UTC"),
  );
}

/** "Georgia -6.5" as the feed may write it, with a true minus sign. */
function spreadText(spread: string): string {
  return spread.replace(/-(?=\d)/, "−");
}

/** One team's column in the header: logo, "#rank Name" wrapping and never truncated, and its record before kickoff. */
function TeamColumn({
  team,
  rank,
  record,
  lost,
}: {
  team: string;
  rank: number | null;
  record: string | null;
  lost: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <TeamLogo team={team} size={40} className={lost ? "opacity-50" : ""} />
      <span
        className={`max-w-full text-center font-display text-[15px] leading-[18px] font-black break-words ${
          lost ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {rank ? <span className="font-sans text-xs font-bold tabular-nums text-muted-foreground">#{rank}</span> : null}
        {rank ? " " : null}
        {team}
      </span>
      {record ? <span className="text-[13px] leading-4 font-medium tabular-nums text-muted-foreground">{record}</span> : null}
    </div>
  );
}

/** One side's score: a fixed two digits wide, orange while it counts. */
function Score({ value, side, muted }: { value: number; side: Side; muted: boolean }) {
  const { shown, counting } = useCountUp(value);
  return (
    <span
      className={`inline-block min-w-[2ch] ${side === "away" ? "text-right" : "text-left"} ${
        counting ? "text-live" : muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {shown}
    </span>
  );
}

/** A possession slot: always takes its room, so the score never shifts when the ball changes hands. */
function BallSlot({ has }: { has: boolean }) {
  return (
    <span className={`inline-flex self-center ${has ? "" : "invisible"}`} aria-hidden={!has}>
      <Football />
    </span>
  );
}

/** The TV network, as an outlined chip. */
function TvChip({ tv }: { tv: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-2 py-px text-xs font-semibold whitespace-nowrap">
      {tv}
    </span>
  );
}

/**
 * What the header shows while the "On the field" card is up: the score, the
 * clock and the ball as of the last play that landed, so the header never
 * gets ahead of the field (#310).
 */
interface Landed {
  score: { home: number; away: number };
  clock: string | null;
  ball: Side | null;
}

/**
 * The scoreboard across the top of the sheet. Live and final, the score sits
 * in the middle with the ball-carrier's football on its outer side and the
 * Live badge or Final under it. Before kickoff, ESPN's layout (#318): the
 * relative date where the score goes, the kickoff time where the clock goes,
 * the TV chip under it, and each team's record under its name.
 */
function SheetHeader({ game, serverNow, landed }: { game: LiveGameJson; serverNow: string; landed: Landed | null }) {
  const { result, detail } = game;
  const g = game.game;
  const final = result.status === "final" && result.shown !== null;
  const beforeKickoff = result.status === "pending" && result.live === null;
  const ball = landed ? landed.ball : result.live ? (result.live.feed?.ball ?? result.live.possession) : null;
  const awayScore = landed?.score.away ?? result.shown?.awayScore ?? 0;
  const homeScore = landed?.score.home ?? result.shown?.homeScore ?? 0;
  const awayLost = final && sideStanding(result, "away") === "lost";
  const homeLost = final && sideStanding(result, "home") === "lost";
  const kickoff = new Date(g.kickoff);
  const day = useLocalLabel((tz) => kickoffDay(kickoff, new Date(serverNow), tz));
  const time = useLocalLabel((tz) => kickoffTime(kickoff, tz));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-4 pt-2 pb-3">
      <TeamColumn team={g.awayTeam} rank={g.awayRank} record={beforeKickoff ? (detail?.away.record ?? null) : null} lost={awayLost} />
      {beforeKickoff ? (
        <div className="flex flex-col items-center gap-0.5">
          <p className="font-display text-2xl leading-10 font-black whitespace-nowrap">{day}</p>
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums text-muted-foreground">{time}</span>
          {detail?.tv ? (
            <span className="mt-1">
              <TvChip tv={detail.tv} />
            </span>
          ) : null}
        </div>
      ) : result.shown ? (
        <div className="flex flex-col items-center gap-1">
          <p className="flex items-baseline gap-2 font-display text-[32px] leading-10 font-black tabular-nums">
            {final ? null : <BallSlot has={ball === "away"} />}
            <Score value={awayScore} side="away" muted={awayLost} />
            <span aria-hidden className="text-xl text-border">
              –
            </span>
            <Score value={homeScore} side="home" muted={homeLost} />
            {final ? null : <BallSlot has={ball === "home"} />}
          </p>
          {result.live ? (
            <Badge variant="live" className="tabular-nums">
              <Radio size={12} aria-hidden />
              {(landed ? landed.clock : clockLabel(result.live)) ?? result.label}
            </Badge>
          ) : (
            <Badge variant="outline">{result.label}</Badge>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 pt-2">
          <Badge variant="void">Void</Badge>
          <span className="max-w-32 text-center text-xs text-muted-foreground">
            {result.note ? `${result.note}. ` : null}Scores zero for everyone.
          </span>
        </div>
      )}
      <TeamColumn team={g.homeTeam} rank={g.homeRank} record={beforeKickoff ? (detail?.home.record ?? null) : null} lost={homeLost} />
    </div>
  );
}

const STANDING_BORDER: Record<SideStanding, string> = {
  won: "border-win",
  lost: "border-loss/40",
  leading: "border-border",
  trailing: "border-border",
  level: "border-border",
  none: "border-border",
};

/** One side of the sheet: who took it, ringed by how it's doing, with a chip per member. */
function SidePanel({
  team,
  rank,
  teamId,
  standingWord,
  picks,
  members,
  viewerId,
  total,
}: {
  team: string;
  rank: number | null;
  teamId: number;
  standingWord: SideStanding;
  picks: RevealPick[];
  members: Map<number, ScoredMember>;
  viewerId: number;
  total: number;
}) {
  const onSide = picks.filter((p) => p.teamId === teamId);
  return (
    <Card className={`grid gap-2 p-2.5 ${STANDING_BORDER[standingWord]}`}>
      <div className="flex items-center gap-2">
        <TeamLogo team={team} size={24} />
        {rank ? <span className="text-xs font-bold tabular-nums text-muted-foreground">#{rank}</span> : null}
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-black">{team}</span>
        {standingWord === "won" ? <Badge variant="win">Won</Badge> : null}
        {standingWord === "lost" ? <Badge variant="loss">Lost</Badge> : null}
        {standingWord === "leading" ? <Badge variant="outline">Leading</Badge> : null}
        {standingWord === "trailing" ? <Badge variant="outline">Trailing</Badge> : null}
        {total > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {onSide.length} of {total}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {onSide.length === 0 ? <span className="text-sm text-muted-foreground">Nobody picked this side.</span> : null}
        {onSide.map((pick) => {
          const member = members.get(pick.memberId);
          if (!member) return null;
          const you = pick.memberId === viewerId;
          return (
            <span
              key={pick.memberId}
              className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 ${
                you ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              <Pennant avatarId={member.avatarId} name={member.displayName} size={20} />
              <span className={`text-xs ${you ? "font-extrabold" : "font-semibold"}`}>{you ? "You" : member.displayName}</span>
              {pick.lock === "counts" ? <Lock size={12} strokeWidth={3} aria-label="Lock of the Week" /> : null}
              {pick.lock === "dropped" ? (
                <LockOpen
                  size={12}
                  strokeWidth={3}
                  className={you ? "" : "text-muted-foreground"}
                  aria-label="Lock of the Week, dropped: the game is void"
                />
              ) : null}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Before the Deadline, one card in place of the two picks panels (#318): the
 * viewer's own pick, when everyone's appear, and the way to the pick screen.
 */
function OwnPickCard({ game, deadline }: { game: LiveGameJson; deadline: string }) {
  const mine: OwnPickJson | null = game.ownPick;
  const team = mine === null ? null : mine.teamId === game.game.homeTeamId ? game.game.homeTeam : game.game.awayTeam;
  return (
    <Card className="grid gap-2.5 p-3">
      {mine && team ? (
        <div className="flex items-center gap-2 border-b border-muted pb-2.5">
          <span className="flex-1 text-xs font-bold tracking-[0.08em] text-secondary uppercase">Your pick</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary py-1 pr-2.5 pl-1 text-primary-foreground">
            <TeamLogo team={team} size={20} />
            <span className="text-xs font-extrabold">{team}</span>
            {mine.lock === "counts" ? <Lock size={12} strokeWidth={3} aria-label="Lock of the Week" /> : null}
            {mine.lock === "dropped" ? (
              <LockOpen size={12} strokeWidth={3} aria-label="Lock of the Week, dropped: the game is void" />
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="flex items-start gap-2.5">
        <Eye size={18} className="mt-px shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm">
          <b>Everyone&rsquo;s picks show at the deadline,</b>{" "}
          <span className="text-muted-foreground">
            <LocalTime at={deadline} style="slot" />.
          </span>
        </p>
      </div>
      <Link href="/picks" className="tap inline-flex min-h-11 items-center self-start text-sm font-semibold text-secondary">
        {mine ? "Change your pick" : "Make your pick"}
      </Link>
    </Card>
  );
}

/** A card's heading, in the sheet's small-caps style. */
function CardHeading({ children, aside }: { children: string; aside?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="flex-1 text-xs font-bold tracking-[0.08em] text-secondary uppercase">{children}</h3>
      {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
    </div>
  );
}

/**
 * This drive's plays, newest first, every scoring play tinted and tagged with
 * the new score, and one line for the drive before at the bottom (#314).
 */
function RecentPlaysCard({ card }: { card: RecentPlays }) {
  return (
    <Card className="grid gap-2 p-2.5">
      <CardHeading aside="This drive">Recent plays</CardHeading>
      {card.plays.length === 0 ? (
        <p className="text-sm text-muted-foreground">Plays show up here as they happen.</p>
      ) : (
        <ol>
          {card.plays.map((play, i) => {
            const ruled = i > 0 && play.score === null && card.plays[i - 1].score === null;
            return (
              <li
                key={play.id}
                className={`grid grid-cols-[40px_minmax(0,1fr)] gap-2 py-2 ${
                  play.score ? "rounded-md bg-accent px-2" : ""
                } ${ruled ? "border-t border-muted" : ""}`}
              >
                <span className="text-xs leading-5 tabular-nums text-muted-foreground">{play.clock}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  {play.score ? (
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-live px-2 py-px text-[11px] leading-4 font-extrabold tracking-[0.06em] text-live-foreground uppercase">
                        {play.score.tag}
                      </span>
                      <span className="flex-1" />
                      <span className="font-display text-sm font-black tabular-nums">{play.score.line}</span>
                    </span>
                  ) : null}
                  <span className={`text-sm ${i === 0 ? "font-semibold" : ""}`}>{play.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {card.recap ? (
        <p className="border-t border-muted pt-2 text-xs text-muted-foreground">
          <span className="font-bold tracking-[0.08em] uppercase">Last drive</span> · {card.recap}
        </p>
      ) : null}
    </Card>
  );
}

/** A Game information row: an icon, then whatever the row holds. */
function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-muted py-3">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {children}
    </div>
  );
}

/** Before kickoff, below the picks: when, where with the weather, where to watch, and the spread (#318). */
function GameInformation({ game }: { game: LiveGameJson }) {
  const { detail } = game;
  const kickoff = new Date(game.game.kickoff);
  const when = useLocalLabel((tz) => kickoffLine(kickoff, tz));
  const spread = game.game.spread;
  return (
    <Card className="grid gap-0 px-3 pt-3 pb-0">
      <h3 className="pb-2.5 text-xs font-bold tracking-[0.08em] text-secondary uppercase">Game information</h3>
      <InfoRow icon={<Calendar size={18} aria-hidden />}>
        <span className="text-sm font-semibold">{when}</span>
      </InfoRow>
      {detail ? (
        <InfoRow icon={<MapPin size={18} aria-hidden />}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">{detail.venue}</span>
            {detail.city ? <span className="text-[13px] leading-[18px] text-muted-foreground">{detail.city}</span> : null}
          </span>
          {detail.weather ? <WeatherPill weather={detail.weather} /> : null}
        </InfoRow>
      ) : null}
      {detail?.tv ? (
        <InfoRow icon={<Tv size={18} aria-hidden />}>
          <span className="flex-1 text-sm font-semibold">Where to watch</span>
          <TvChip tv={detail.tv} />
        </InfoRow>
      ) : null}
      {spread ? (
        <InfoRow icon={<Scale size={18} aria-hidden />}>
          <span className="flex-1 text-sm font-semibold">Spread</span>
          <span className="text-sm tabular-nums">{spread === "Pick" ? "Pick" : spreadText(spread)}</span>
        </InfoRow>
      ) : null}
    </Card>
  );
}

/** Everyone's Tiebreaker Guess, closest first once the game is final. */
function TiebreakerSection({ game, scores, viewerId }: { game: LiveGameJson; scores: WeeklyScore[]; viewerId: number }) {
  const final = game.result.status === "final";
  const combined = final && game.result.shown ? game.result.shown.homeScore + game.result.shown.awayScore : null;
  const guessed = scores.filter((s) => s.tiebreakerGuess !== null);
  const sorted = [...guessed].sort((a, b) =>
    final ? (a.tiebreakerError ?? Infinity) - (b.tiebreakerError ?? Infinity) : a.tiebreakerGuess! - b.tiebreakerGuess!,
  );
  const missing = scores.length - guessed.length;
  return (
    <Card className="grid gap-2 border-secondary p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-xs font-bold tracking-[0.08em] text-secondary uppercase">Tiebreaker Guesses</span>
        <span className="text-xs text-muted-foreground">{combined !== null ? `Finished ${combined}` : "Combined final score"}</span>
      </div>
      <div className="grid gap-0.5">
        {sorted.map((s) => {
          const you = s.member.id === viewerId;
          return (
            <div key={s.member.id} className={`flex min-h-8 items-center gap-2 rounded-md px-1.5 ${you ? "bg-accent" : ""}`}>
              <Pennant avatarId={s.member.avatarId} name={s.member.displayName} size={20} />
              <span className={`min-w-0 flex-1 truncate text-sm ${you ? "font-extrabold" : "font-semibold"}`}>
                {you ? "You" : s.member.displayName}
              </span>
              {final ? <span className="text-xs tabular-nums text-muted-foreground">off by {s.tiebreakerError}</span> : null}
              <span className="font-display text-[15px] tabular-nums">{s.tiebreakerGuess}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Closest guess breaks a tie on points.{" "}
        {missing > 0 ? `${plural(missing, "member")} ${missing === 1 ? "has" : "have"} not guessed yet.` : "Everyone has guessed."}
      </p>
    </Card>
  );
}

interface SheetProps {
  /** The `GAME_SHEET_LIVE` switch, decided on the server for this member: whether the "On the field" card shows. */
  fieldCard: boolean;
  members: Map<number, ScoredMember>;
  scores: WeeklyScore[] | null;
  viewerId: number;
  tiebreakerGameId: number | null;
  locked: boolean;
  deadline: string;
  serverNow: string;
}

/** Everything under the drawer's handle for one game. Keyed on the game, so its polling and counting start fresh for each. */
function SheetBody({
  game,
  fieldCard,
  members,
  scores,
  viewerId,
  tiebreakerGameId,
  locked,
  deadline,
  serverNow,
}: SheetProps & { game: LiveGameJson }) {
  const { result } = game;
  const g = game.game;
  const live = result.status === "pending" && result.live !== null;
  const beforeKickoff = result.status === "pending" && result.live === null;
  const feed = useGamePlays(g.id, live);
  const teams = useMemo(
    () => ({ homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, homeTeam: g.homeTeam, awayTeam: g.awayTeam }),
    [g.homeTeamId, g.awayTeamId, g.homeTeam, g.awayTeam],
  );
  // With the card up, the list and the header wait for each play to land.
  const player = useFieldPlayer(feed, teams, fieldCard && live);
  const card = player.shown ? recentPlays(player.shown, teams) : null;
  const landed: Landed | null =
    player.readout && player.holdsHeader
      ? {
        score: player.score ?? player.readout.score,
        clock: player.readout.clock,
        ball: player.readout.side,
      }
    : null;
  const padlock = locked && game.picks.some((pick) => pick.lock !== null);

  return (
    <>
      <SheetHeader game={game} serverNow={serverNow} landed={landed} />
      <div className="grid gap-2.5 overflow-y-auto px-4 pb-2" style={{ maxHeight: "calc(100dvh - 300px)" }}>
        {player.readout ? <FieldCard player={player} awayTeam={g.awayTeam} homeTeam={g.homeTeam} /> : null}
        {locked ? (
          <>
            <SidePanel
              team={g.awayTeam}
              rank={g.awayRank}
              teamId={g.awayTeamId}
              standingWord={sideStanding(result, "away")}
              picks={game.picks}
              members={members}
              viewerId={viewerId}
              total={members.size}
            />
            <SidePanel
              team={g.homeTeam}
              rank={g.homeRank}
              teamId={g.homeTeamId}
              standingWord={sideStanding(result, "home")}
              picks={game.picks}
              members={members}
              viewerId={viewerId}
              total={members.size}
            />
            {padlock ? <p className="text-xs text-muted-foreground">A padlock marks that member&rsquo;s Lock of the Week.</p> : null}
          </>
        ) : (
          <OwnPickCard game={game} deadline={deadline} />
        )}
        {g.id === tiebreakerGameId && scores ? <TiebreakerSection game={game} scores={scores} viewerId={viewerId} /> : null}
        {live && card ? <RecentPlaysCard card={card} /> : null}
        {/* Final team stats and game leaders (#309) go here, once the game is final. */}
        {beforeKickoff ? <GameInformation game={game} /> : null}
      </div>
    </>
  );
}

/** Tap a game for the full picture: the scoreboard, everyone's pick, the Tiebreaker Guesses and, live, the drive so far. */
export function GameSheet({ game, onClose, ...props }: SheetProps & { game: LiveGameJson | null; onClose: () => void }) {
  return (
    <Drawer open={game !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DrawerContent className="mx-auto max-w-md">
        {game ? (
          <>
            <DrawerHeader className="sr-only">
              <DrawerTitle>
                {game.game.awayTeam} at {game.game.homeTeam}
              </DrawerTitle>
              <DrawerDescription>{game.result.label}</DrawerDescription>
            </DrawerHeader>
            <SheetBody key={game.game.id} game={game} {...props} />
          </>
        ) : null}
        <DrawerFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
