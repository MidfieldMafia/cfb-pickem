"use client";

import Image from "next/image";
import { Camera, ChevronRight, CircleAlert, ImageIcon, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonVariants, Card, Pennant, SECTION_LABEL, BackLink, BLANK_PENNANT, type PennantDesign } from "@saturday-slate/design-system";

import { avatars, findAvatar, NEW_PHOTO, ownAvatarId, ownDesign, teamAvatarConferences, type Avatar } from "@/lib/avatars";
import { PennantMaker } from "./pennant-maker";
import { PhotoCrop } from "./photo-crop";

/**
 * The pennant picker every "who are you" form shares: the welcome page, a Join
 * Link, and Start a group. Two kinds of pennant live behind it — fifteen flags
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
 *
 * With `photo`, which only the welcome page passes, a third root card offers
 * the member's own photo (#231). A new crop is a JPEG held in page state until
 * Save: `avatarId` says `photo`, and the JPEG joins the form's `FormData` as
 * `photo` when it is built. A member who already has a photo sees it in the
 * card, and choosing it posts back its own `photo-…` id. Either stays one tap
 * away while the member tries flags, until the page is left.
 *
 * `welcome` also puts "Make your own" first in Flags (#398). Its maker's Done
 * chooses an `own-…` id, which the page's Save commits like any other. The
 * tile shows the member's design while it is their pennant, or once made on
 * this page; a member who saved something else since starts blank (#427).
 */
export function PennantPicker({ selected, welcome = false }: { selected?: string | null; welcome?: boolean }) {
  const [chosen, setChosen] = useState(selected ?? "");
  const [view, setView] = useState<View>({ level: "root" });
  const [crop, setCrop] = useState<NewPhoto | null>(null);
  const [made, setMade] = useState<PennantDesign | null>(null);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const saved = findAvatar(selected);
  const own: Avatar | undefined = crop ? crop.mark : saved?.kind === "photo" ? saved : undefined;
  const ownFlag = made ?? ownDesign(selected);
  const current = chosen === NEW_PHOTO ? crop?.mark : findAvatar(chosen);

  useEffect(() => {
    const form = fieldset.current?.form;
    if (!form || !crop || chosen !== NEW_PHOTO) return;
    const attach = (event: FormDataEvent) => event.formData.set("photo", crop.jpeg, "photo.jpg");
    form.addEventListener("formdata", attach);
    return () => form.removeEventListener("formdata", attach);
  }, [crop, chosen]);

  return (
    <fieldset ref={fieldset} className="space-y-2">
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
              Yours: <span className="font-semibold text-foreground">{yoursName(current)}</span>
            </p>
          ) : null}
          <Choice
            title="Flags"
            detail={welcome ? `${avatars.length} presets, or make your own` : `${avatars.length} pennants`}
            peek={avatars.slice(0, 3)}
            onClick={() => setView({ level: "flags" })}
          />
          <Choice
            title="Team Logos"
            detail={`${teamCount} teams in ${teamAvatarConferences.length} conferences`}
            peek={peekTeams}
            onClick={() => setView({ level: "conferences" })}
          />
          {welcome ? (
            <PhotoCard
              own={own}
              chosen={own !== undefined && own.id === chosen}
              onChoose={() => own && setChosen(own.id)}
              onCrop={(jpeg) => {
                if (crop) URL.revokeObjectURL(crop.mark.file);
                setCrop(newPhoto(jpeg));
                setChosen(NEW_PHOTO);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {view.level === "flags" ? (
        <Level title="Flags" onBack={() => setView({ level: "root" })}>
          <div className="grid grid-cols-4 gap-3">
            {welcome ? (
              <OwnFlagTile design={ownFlag} chosen={chosen} onOpen={() => setView({ level: "maker" })} />
            ) : null}
            {avatars.map((avatar) => (
              <Disc key={avatar.id} avatar={avatar} size={72} chosen={chosen} onChoose={setChosen} />
            ))}
          </div>
        </Level>
      ) : null}

      {view.level === "maker" ? (
        <PennantMaker
          initial={ownFlag ?? BLANK_PENNANT}
          editing={ownFlag !== undefined}
          onBack={() => setView({ level: "flags" })}
          onDone={(design) => {
            setMade(design);
            setChosen(ownAvatarId(design));
            setView({ level: "flags" });
          }}
        />
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

/** A crop not yet saved: the JPEG that will post, and a mark to show it by until then. */
interface NewPhoto {
  jpeg: Blob;
  mark: Avatar;
}

function newPhoto(jpeg: Blob): NewPhoto {
  return {
    jpeg,
    mark: { id: NEW_PHOTO, name: "Your photo", file: URL.createObjectURL(jpeg), color: "var(--muted-foreground)", kind: "photo" },
  };
}

type View =
  | { level: "root" }
  | { level: "flags" }
  | { level: "maker" }
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
        <BackLink onClick={onBack}>
          <span className="sr-only">Back</span>
        </BackLink>
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

/** What the "Yours:" line calls the chosen pennant. */
function yoursName(avatar: Avatar): string {
  if (avatar.kind === "photo") return "Your photo";
  return ownDesign(avatar.id) ? "Your own flag" : avatar.name;
}

/**
 * "Make your own", top left of Flags. A dashed "+" until the member has a
 * design; then the design itself, with a pencil to say a tap edits it rather
 * than choosing it. Chosen shows on the cell, as on every other disc.
 */
function OwnFlagTile({
  design,
  chosen,
  onOpen,
}: {
  design: PennantDesign | undefined;
  chosen: string;
  onOpen: () => void;
}) {
  const mark = design ? findAvatar(ownAvatarId(design)) : undefined;
  const isChosen = mark !== undefined && mark.id === chosen;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={mark ? "Edit your own flag" : "Make your own"}
      aria-pressed={isChosen}
      className={`relative flex h-auto flex-col items-center rounded-xl border p-1.5 ${
        isChosen ? "border-primary bg-accent" : "border-transparent"
      }`}
    >
      {mark ? (
        <>
          <Pennant avatar={mark} size={72} />
          <span
            aria-hidden
            className="absolute right-1 bottom-1 flex size-[22px] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
          >
            <Pencil className="size-3" strokeWidth={2.5} />
          </span>
        </>
      ) : (
        <span
          aria-hidden
          className="flex size-[72px] items-center justify-center rounded-full border-2 border-dashed border-border text-primary"
        >
          <Plus className="size-6" />
        </span>
      )}
    </button>
  );
}

const NOTHING_BACK = "No photo came back from the camera. If your phone won’t let Chrome use it, choose a photo instead.";
const NOT_A_PHOTO = "That file isn’t a photo. Choose another.";

/**
 * The "Your photo" root card. Unlike Flags and Team Logos it does not open a
 * level: its two actions sit on it, because each one is a file input, and a
 * member who already has a photo taps the card's head to choose it again.
 *
 * Two inputs, not one: Android's photo picker hides the camera from a plain
 * `accept="image/*"`, so the camera gets its own `capture` input (#219, #229).
 * Neither has a `name`; what posts is the finished crop, never the original.
 */
function PhotoCard({
  own,
  chosen,
  onChoose,
  onCrop,
}: {
  own: Avatar | undefined;
  chosen: boolean;
  onChoose: () => void;
  onCrop: (jpeg: Blob) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const close = () => {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
  };

  const pick = (event: React.ChangeEvent<HTMLInputElement>, camera: boolean) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared so that picking the same photo again still fires a change.
    input.value = "";
    if (!file) return setNote(camera ? NOTHING_BACK : null);
    // The type, never the name: iOS names a camera photo `image.jpg` whatever it is (#218).
    if (!file.type.startsWith("image/")) return setNote(NOT_A_PHOTO);
    setNote(null);
    setSource(URL.createObjectURL(file));
  };

  // A camera Chrome may not use returns no file and fires no change, only `cancel`,
  // which is also what backing out fires; the note is worded for both (#229).
  const cameraCancel = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    const nothingBack = () => setNote(NOTHING_BACK);
    input.addEventListener("cancel", nothingBack);
    return () => input.removeEventListener("cancel", nothingBack);
  }, []);

  const action = buttonVariants({ variant: "outline", className: "h-tap w-full cursor-pointer has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50" });

  return (
    <Card className={chosen ? "border-primary bg-accent" : undefined}>
      {own ? (
        <button type="button" onClick={onChoose} aria-pressed={chosen} className="flex w-full items-center gap-3 text-left">
          <Pennant avatar={own} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Your photo</span>
            <span className="block text-sm text-muted-foreground">{chosen ? "Chosen" : "Tap to use it again"}</span>
          </span>
          {chosen ? (
            <span className="text-xs font-bold text-primary">Yours</span>
          ) : (
            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          )}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--muted-foreground)_18%,transparent)] text-muted-foreground">
            <Camera aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Your photo</span>
            <span className="block text-sm text-muted-foreground">A selfie, or one from your phone</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className={action}>
          <Camera aria-hidden />
          {own ? "New photo" : "Take a photo"}
          <input
            ref={cameraCancel}
            type="file"
            accept="image/*"
            capture="user"
            onChange={(event) => pick(event, true)}
            className="sr-only"
          />
        </label>
        <label className={action}>
          <ImageIcon aria-hidden />
          {own ? "Choose another" : "Choose a photo"}
          <input type="file" accept="image/*" onChange={(event) => pick(event, false)} className="sr-only" />
        </label>
      </div>
      {note ? (
        <p role="status" className="flex gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {note}
        </p>
      ) : null}
      {source ? (
        <PhotoCrop
          src={source}
          onCancel={close}
          onUse={(jpeg) => {
            close();
            onCrop(jpeg);
          }}
          onFail={(message) => {
            close();
            setNote(message);
          }}
        />
      ) : null}
    </Card>
  );
}
