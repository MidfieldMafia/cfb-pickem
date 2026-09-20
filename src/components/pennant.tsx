import { findAvatar } from "@/lib/avatars";
import { Pennant as DSPennant, PennantGroup as DSPennantGroup } from "@saturday-slate/design-system";

/** A member's pennant avatar. Resolves `avatarId` and forwards to the design system's presentational `Pennant`. */
export function Pennant({
  avatarId,
  name,
  size,
}: {
  avatarId: string | null;
  /** The member's display name, for the initial shown when they have no pennant yet. */
  name?: string;
  size?: number;
}) {
  return <DSPennant avatar={findAvatar(avatarId)} name={name} size={size} />;
}

export interface PennantGroupMember {
  id: number;
  avatarId: string | null;
  displayName: string;
}

/** Resolves each member's `avatarId` and forwards to the design system's presentational `PennantGroup`. */
export function PennantGroup({
  members,
  viewerId,
  size,
  max,
}: {
  members: readonly PennantGroupMember[];
  viewerId?: number;
  size?: number;
  max?: number;
}) {
  const resolved = members.map((m) => ({ id: m.id, avatar: findAvatar(m.avatarId), displayName: m.displayName }));
  return <DSPennantGroup members={resolved} viewerId={viewerId} size={size} max={max} />;
}
