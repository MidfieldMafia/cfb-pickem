import { subscribeDevice } from "@/lib/push/device";
import { turnOnNotificationsAction } from "@/app/(member)/settings/actions";

/** How asking for push on this phone ended. */
export type TurnedOn = { ok: true } | { ok: false; why: "denied" } | { ok: false; why: "error"; message: string };

/**
 * The one subscribe path (#454, #482, #529): Notifications on for this phone.
 * The Settings switch, the first-open sheet, the Picks banner and the
 * onboarding step all run it. It asks permission inside the tap that called
 * it, then saves this device; the Pick reminder is on by default, so the asks'
 * copy holds. Don't Allow saves nothing and comes back `denied`.
 */
export async function turnOnReminder(publicKey: string): Promise<TurnedOn> {
  const device = await subscribeDevice(publicKey);
  if (!device.ok) {
    return device.why === "denied" ? { ok: false, why: "denied" } : { ok: false, why: "error", message: "Couldn't turn it on. Try again." };
  }
  const saved = await turnOnNotificationsAction(device.subscription);
  if (saved.error) return { ok: false, why: "error", message: saved.error };
  return { ok: true };
}
