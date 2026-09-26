import { BackLink } from "@saturday-slate/design-system";
import { requireMember } from "@/lib/members/current";
import { pushConfigFromEnv } from "@/lib/push/sender";
import { NotificationsForm } from "./notifications-form";

/**
 * Notifications, opened from the You screen: turn push on for this device,
 * and choose what it is told about. The device does the subscribing — the
 * permission prompt has to come from a tap here — and `/api/push` keeps the
 * record. When the server has no VAPID keys the screen says so and offers
 * nothing, so a self-hosted copy without them is not a broken button.
 */
export default async function Notifications() {
  await requireMember();
  const config = pushConfigFromEnv();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8">
      <div className="flex h-14 items-center">
        <BackLink href="/you">You</BackLink>
      </div>
      <div className="space-y-1">
        <h1 className="font-display">Notifications</h1>
        <p className="text-sm text-muted-foreground">A buzz when the Chat lights up, and when a game goes Final.</p>
      </div>
      <NotificationsForm publicKey={config?.publicKey ?? null} />
    </main>
  );
}
