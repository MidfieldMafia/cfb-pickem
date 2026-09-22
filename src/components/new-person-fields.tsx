import { PennantPicker } from "@/components/pennant-picker";
import { SECTION_LABEL, Input } from "@saturday-slate/design-system";

import { MAX_DISPLAY_NAME, MAX_PHONE } from "@/lib/members/limits";

/**
 * Name, phone number and pennant: what someone setting themselves up is asked,
 * through a Join Link or by starting a group. The phone number is how the app
 * knows one person from two, so it is required here, as it is for anyone added
 * by hand.
 */
export function NewPersonFields() {
  return (
    <>
      <div className="space-y-2">
        <label htmlFor="displayName" className={`block ${SECTION_LABEL}`}>
          Your name on the leaderboard
        </label>
        <Input id="displayName" name="displayName" maxLength={MAX_DISPLAY_NAME} required autoComplete="nickname" className="text-lg" />
      </div>
      <div className="space-y-2">
        <label htmlFor="phone" className={`block ${SECTION_LABEL}`}>
          Your phone number
        </label>
        <Input id="phone" name="phone" type="tel" maxLength={MAX_PHONE} required autoComplete="tel" className="text-lg" />
        <p className="text-sm text-muted-foreground">One number is one person, in every group you play in.</p>
      </div>
      <PennantPicker />
    </>
  );
}
