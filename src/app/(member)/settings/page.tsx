import { AppHeader } from "@saturday-slate/design-system";
import { MemberMenu } from "@/components/member-menu";
import { currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { pushConfigFromEnv } from "@/lib/push/sender";
import { reminderSwitch } from "@/lib/push/settings";
import { ReminderSwitch } from "./reminder-switch";

/**
 * Settings (#454): how the app behaves for the member, where Your profile is
 * who they are. One row for now, the Pick reminder by push, on or off. Opened
 * from the member menu.
 */
export default async function Settings() {
  const member = await requireMember();
  const { on, stopped } = reminderSwitch(member);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader title="Settings" right={<MemberMenu member={member} manage={await currentManageHref()} />} />
      <ReminderSwitch on={on} stopped={stopped} publicKey={pushConfigFromEnv()?.publicKey ?? null} />
    </main>
  );
}
