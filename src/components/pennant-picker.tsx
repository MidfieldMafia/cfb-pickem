import Image from "next/image";
import { SECTION_LABEL } from "@/components/section-label";
import type { Avatar } from "@/lib/avatars";

/**
 * The pennant grid every "who are you" form shares: the welcome page, a Join
 * Link, and Start a group. Plain radios, so it posts with the form and needs no
 * client state of its own.
 */
export function PennantPicker({ avatars, selected }: { avatars: readonly Avatar[]; selected?: string | null }) {
  return (
    <fieldset className="space-y-2">
      <legend className={SECTION_LABEL}>Pick your pennant</legend>
      <div className="grid grid-cols-[repeat(auto-fill,72px)] gap-2">
        {avatars.map((avatar) => (
          <label key={avatar.id} className="cursor-pointer">
            <input
              type="radio"
              name="avatarId"
              value={avatar.id}
              defaultChecked={avatar.id === selected}
              className="peer sr-only"
              required
            />
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-border bg-card p-1 peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              <Image src={avatar.file} alt={avatar.name} width={72} height={72} unoptimized className="w-full h-auto rounded-full" />
            </span>
          </label>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Twelve pennants, one per member. Pick the one that feels like you.</p>
    </fieldset>
  );
}
