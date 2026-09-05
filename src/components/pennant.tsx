import Image from "next/image";
import { findAvatar } from "@/lib/avatars";

/** A member's pennant avatar. 96 on the picker, 44 in lists, 28 inline. */
export function Pennant({ avatarId, size = 44 }: { avatarId: string | null; size?: 96 | 44 | 28 }) {
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
