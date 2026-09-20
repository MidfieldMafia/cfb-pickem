import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "cn";

/** The tint every disc without a chosen pennant falls back to — never flat gray. */
const FALLBACK_PENNANT = "var(--muted-foreground)";

const DISC = "bg-[color-mix(in_srgb,var(--pennant)_18%,transparent)]";

export interface PennantMark {
  /** The pennant's own display name, used as the image `alt`. */
  name: string;
  /** Path to the pennant flag SVG. */
  file: string;
  /** The member's chosen tint, used at 18% behind the flag. */
  color: string;
}

/**
 * A member's pennant avatar. 72 on the picker, 44 in lists, 28 inline, 20 on
 * drawer chips. Presentational: the caller resolves `avatarId` to a
 * `PennantMark` (or `undefined` when the member has none yet).
 */
export function Pennant({
  avatar,
  name,
  size = 44,
}: {
  avatar: PennantMark | undefined;
  /** The member's display name, for the initial shown when they have no pennant yet. */
  name?: string;
  size?: number;
}) {
  if (!avatar) {
    const initial = name?.trim().charAt(0).toUpperCase();
    return (
      <span
        aria-hidden
        className={cn("font-display inline-flex shrink-0 items-center justify-center rounded-full", DISC)}
        style={{ width: size, height: size, "--pennant": FALLBACK_PENNANT, color: FALLBACK_PENNANT, fontSize: size * 0.42 } as CSSProperties}
      >
        {initial}
      </span>
    );
  }

  const flagSize = Math.round(size * 1.25);
  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full", DISC)}
      style={{ width: size, height: size, "--pennant": avatar.color } as CSSProperties}
    >
      <Image
        src={avatar.file}
        alt={avatar.name}
        width={flagSize}
        height={flagSize}
        unoptimized
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
    </span>
  );
}

export interface PennantGroupMember {
  id: number | string;
  avatar: PennantMark | undefined;
  displayName: string;
}

/** Overlapping pennants for a roster too long to list — the viewer's own pinned first. */
export function PennantGroup({
  members,
  viewerId,
  size = 28,
  max = 5,
}: {
  members: readonly PennantGroupMember[];
  viewerId?: number | string;
  size?: number;
  max?: number;
}) {
  const ordered =
    viewerId == null
      ? members
      : [...members].sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId));
  const shown = ordered.slice(0, max);
  const overflow = ordered.length - shown.length;
  const overlap = Math.round(size / 3);

  return (
    <div className="flex items-center">
      {shown.map((member, i) => (
        <span
          key={member.id}
          className="rounded-full ring-2 ring-background"
          style={i === 0 ? undefined : { marginLeft: -overlap }}
        >
          <Pennant avatar={member.avatar} name={member.displayName} size={size} />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="flex items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-background"
          style={{ width: size, height: size, marginLeft: -overlap }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
