"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Card, Pennant, SECTION_LABEL } from "@saturday-slate/design-system";

import { avatars, findAvatar, teamAvatarConferences, type Avatar } from "@/lib/avatars";

/**
 * The pennant picker every "who are you" form shares: the welcome page, a Join
 * Link, and Start a group. Two kinds of pennant live behind it — twelve flags
 * and 136 school logos — so it is a three-level drill-down rather than one
 * grid, and therefore a client component (#224).
 *
 * Every disc here is the design system's `Pennant`, tinted with the mark's own
 * colour at 18% exactly as it will be once chosen, so the picker shows the
 * thing itself and not a preview of it. Selection sits on the cell around the
 * disc rather than on the disc, which would fight the tint.
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
              <Pennant avatar={current} size={28} />
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
          <div className="grid grid-cols-4 gap-3">
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
                  marks={conference.teams.slice(0, 3)}
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

/**
 * A full-width row that walks one level in. The two root cards lead with
 * overlapping discs; a conference row leads with its name and trails the bare
 * marks, so eleven rows read as a list of names rather than a wall of discs.
 */
function Choice({
  title,
  detail,
  peek,
  marks,
  onClick,
}: {
  title: string;
  detail: string;
  peek?: readonly Avatar[];
  marks?: readonly Avatar[];
  onClick: () => void;
}) {
  return (
    <Card asChild className="p-0">
      <button type="button" onClick={onClick} className="w-full flex-row items-center gap-3 p-3 text-left">
        {peek ? (
          <span className="flex shrink-0 items-center">
            {peek.map((avatar, i) => (
              <span key={avatar.id} className={i === 0 ? "" : "-ml-2 rounded-full ring-2 ring-card"}>
                <Pennant avatar={avatar} size={28} />
              </span>
            ))}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{detail}</span>
        </span>
        {marks ? (
          <span className="flex shrink-0 items-center gap-1">
            {marks.map((avatar) => (
              <Image key={avatar.id} src={avatar.file} alt="" width={24} height={24} unoptimized className="size-6 object-contain" />
            ))}
          </span>
        ) : null}
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

/**
 * One choosable pennant. The disc is `Pennant` untouched — the tint is the
 * point — so being chosen shows on the cell around it: the accent fill and
 * primary border every selected surface in the app uses.
 */
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
      className={`flex h-auto flex-col items-center gap-1.5 rounded-xl border p-1.5 text-center ${
        isChosen ? "border-primary bg-accent" : "border-transparent"
      }`}
    >
      <Pennant avatar={avatar} size={size} />
      {named ? <span className="w-full text-xs leading-tight">{avatar.name}</span> : null}
      {named ? null : <span className="sr-only">{avatar.name}</span>}
    </button>
  );
}
