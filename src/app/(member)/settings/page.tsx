import { AppHeader } from "@saturday-slate/design-system";
import { db } from "@/db";
import { MemberMenu } from "@/components/member-menu";
import { currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { pushConfigFromEnv } from "@/lib/push/sender";
import { notificationSettings, pushStopped, savedEndpoints } from "@/lib/push/settings";
import { NotificationsCard } from "./notifications-card";

/**
 * Settings (#454, #529): how the app behaves for the member, where Your
 * profile is who they are. One card for now, Notifications: a switch for this
 * phone and a row per push. Opened from the member menu.
 */
export default async function Settings() {
  const member = await requireMember();
  const endpoints = await savedEndpoints(db(), member.id);
  const settings = notificationSettings(member);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader title="Settings" right={<MemberMenu member={member} manage={await currentManageHref()} />} />
      <NotificationsCard
        endpoints={endpoints}
        stopped={pushStopped(member, endpoints.length)}
        reminder={settings.reminder}
        chat={settings.chat}
        weeklyWin={settings.weeklyWin}
        closeGames={settings.closeGames}
        publicKey={pushConfigFromEnv()?.publicKey ?? null}
      />
    </main>
  );
}
