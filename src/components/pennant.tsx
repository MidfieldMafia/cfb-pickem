import Image from "next/image";
import { findAvatar } from "@/lib/avatars";

/** A member's pennant avatar. 96 on the picker, 44 in lists, 28 inline, 20 on drawer chips. */
export function Pennant({ avatarId, size = 44 }: { avatarId: string | null; size?: number }) {
  const avatar = findAvatar(avatarId);
  if (!avatar) {
    return (
      <span
        aria-hidden
        className="inline-block rounded-full bg-muted border border-border"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <Image
      src={avatar.file}
      alt={avatar.name}
      width={size}
      height={size}
      unoptimized
      className="rounded-full shrink-0"
    />
  );
}
