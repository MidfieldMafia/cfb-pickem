"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Card, SECTION_LABEL } from "@saturday-slate/design-system";

import { avatars, findAvatar, teamAvatarConferences, type Avatar } from "@/lib/avatars";

/**
 * The pennant picker every "who are you" form shares: the welcome page, a Join
 * Link, and Start a group. Two kinds of pennant live behind it — twelve flags
 * and 136 school logos — so it is a three-level drill-down rather than one
 * grid, and therefore a client component (#224).
 *
 * The choice rides in a `sr-only` `avatarId` input rather than on the discs
 * themselves. A radio in a level the member has navigated away from would
 * unmount and silently lose their pick; one input outside the levels survives
 * every step, still posts with whatever form the picker sits in, and still
 * carries `required` so the browser asks before the server has to.
 */
export function PennantPicker({ selected }: { selected?: string | null }) {
  const [chosen, setChosen] = useState(selected ?? "");
  const [view, setView] = useState<View>({ level: "root" });
  const current = findAvatar(chosen);

  return (
    <fieldset className="space-y-2">
      <legend className={SECTION_LABEL}>Pick your pennant</legend>
      <input
        name="avatarId"
        value={chosen}
        onChange={() => {}}
        required
        tabIndex={-1}
        aria-label="Your pennant"
        className="sr-only"
      />
      {view.level === "root" ? (
        <div className="space-y-2">
          {current ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mark avatar={current} size={28} className="border-primary bg-accent" />
              Yours: <span className="font-semibold text-foreground">{current.name}</span>
            </p>
          ) : null}
          <Choice
            title="Flags"
            detail={`${avatars.length} pennants`}
            peek={avatars.slice(0, 3)}
            onClick={() => setView({ level: "flags" })}
          />
          <Choice
            title="Team Logos"
            detail={`${teamCount} teams in ${teamAvatarConferences.length} conferences`}
            peek={peekTeams}
            onClick={() => setView({ level: "conferences" })}
          />
        </div>
      ) : null}

      {view.level === "flags" ? (
        <Level title="Flags" onBack={() => setView({ level: "root" })}>
          <div className="grid grid-cols-[repeat(auto-fill,72px)] gap-2">
            {avatars.map((avatar) => (
              <Disc key={avatar.id} avatar={avatar} size={72} chosen={chosen} onChoose={setChosen} />
            ))}
          </div>
        </Level>
      ) : null}

      {view.level === "conferences" ? (
        <Level title="Team Logos" onBack={() => setView({ level: "root" })}>
          <ul className="space-y-2">
            {teamAvatarConferences.map((conference) => (
              <li key={conference.name}>
                <Choice
                  title={conference.name}
                  detail={`${conference.teams.length} teams`}
                  peek={conference.teams.slice(0, 3)}
                  onClick={() => setView({ level: "teams", conference: conference.name })}
                />
              </li>
            ))}
          </ul>
        </Level>
      ) : null}

      {view.level === "teams" ? (
        <Level title={view.conference} onBack={() => setView({ level: "conferences" })}>
          <div className="grid grid-cols-3 gap-3">
            {teamsIn(view.conference).map((avatar) => (
              <Disc key={avatar.id} avatar={avatar} size={64} chosen={chosen} onChoose={setChosen} named />
            ))}
          </div>
        </Level>
      ) : null}
    </fieldset>
  );
}

type View =
  | { level: "root" }
  | { level: "flags" }
  | { level: "conferences" }
  | { level: "teams"; conference: string };

const teamCount = teamAvatarConferences.reduce((n, c) => n + c.teams.length, 0);

/** One mark from each of the first three conferences, so the peek is not all one league. */
const peekTeams = teamAvatarConferences.slice(0, 3).map((c) => c.teams[0]);

function teamsIn(conference: string): readonly Avatar[] {
  return teamAvatarConferences.find((c) => c.name === conference)?.teams ?? [];
}

/** A full-width row that walks one level in: a peek of real marks, a label, a chevron. */
function Choice({
  title,
  detail,
  peek,
  onClick,
}: {
  title: string;
  detail: string;
  peek: readonly Avatar[];
  onClick: () => void;
}) {
  return (
    <Card asChild className="p-0">
      <button type="button" onClick={onClick} className="w-full flex-row items-center gap-3 p-3 text-left">
        <span className="flex shrink-0 items-center">
          {peek.map((avatar, i) => (
            <Mark key={avatar.id} avatar={avatar} size={28} className={i === 0 ? "" : "-ml-2 ring-2 ring-card"} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{detail}</span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
    </Card>
  );
}

/** A level below the root: its own heading and the one step back out of it. */
function Level({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} className="tap -ml-2 flex items-center gap-1 pr-2 pl-1 font-semibold">
          <ChevronLeft aria-hidden className="size-5" />
          <span className="sr-only">Back</span>
        </button>
        <span className="font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Disc({
  avatar,
  size,
  chosen,
  onChoose,
  named = false,
}: {
  avatar: Avatar;
  size: number;
  chosen: string;
  onChoose: (id: string) => void;
  named?: boolean;
}) {
  const isChosen = avatar.id === chosen;
  return (
    <button
      type="button"
      onClick={() => onChoose(avatar.id)}
      aria-pressed={isChosen}
      className="flex h-auto flex-col items-center gap-1 text-center"
    >
      <Mark
        avatar={avatar}
        size={size}
        className={isChosen ? "border-primary bg-accent" : "border-border bg-card"}
      />
      {named ? <span className="w-full text-xs leading-tight text-muted-foreground">{avatar.name}</span> : null}
      {named ? null : <span className="sr-only">{avatar.name}</span>}
    </button>
  );
}

/**
 * The picker's own disc. It shows the mark on card paper rather than over the
 * 18% tint `Pennant` uses, because a grid of 136 tinted discs reads as noise.
 * The geometry is `Pennant`'s: a logo inset at 72% (#225), a flag filling the
 * disc.
 */
function Mark({ avatar, size, className = "" }: { avatar: Avatar; size: number; className?: string }) {
  const logo = avatar.kind === "logo";
  const markSize = Math.round(size * (logo ? 0.72 : 1));
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full border ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={avatar.file}
        alt=""
        width={markSize}
        height={markSize}
        unoptimized
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{ width: markSize, height: markSize }}
      />
    </span>
  );
}
