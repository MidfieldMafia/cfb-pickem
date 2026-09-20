import Link from "next/link";
import { cookies } from "next/headers";
import { AppHeader, CopyButton, SECTION_LABEL, Badge, Button, Card } from "@saturday-slate/design-system";
import { MemberMenu } from "@/components/member-menu";

import { Pennant } from "@/components/pennant";

import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import { currentManageHref, groupChoice, CURRENT_GROUP_COOKIE } from "@/lib/groups/current";
import { anotherOrganizer } from "@/lib/groups/manage";
import { managePath } from "@/lib/groups/manage-state";
import { memberGroups } from "@/lib/groups/memberships";
import { requireMember } from "@/lib/members/current";
import { isCommissioner, magicLinkFor } from "@/lib/members/members";
import { openGroupAction } from "./actions";
import { LeaveForm } from "./leave-form";

/**
 * The member's own place in the app, opened by the name chip: their name and
 * pennant, their personal link, their groups — switch to one, leave one — and
 * Start a group.
 *
 * Leave is drawn only where `leaveGroup` would allow it (the last organizer
 * stays), but that is a convenience: the library refuses it either way.
 */
export default async function You() {
  const member = await requireMember();
  const database = db();
  const [entries, choice] = await Promise.all([
    memberGroups(database, member.id),
    groupChoice(database, member.id, (await cookies()).get(CURRENT_GROUP_COOKIE)?.value),
  ]);
  const commissioner = isCommissioner(member);
  const canLeave = await Promise.all(
    entries.map(
      async (entry) =>
        entry.role !== "organizer" || commissioner || (await anotherOrganizer(database, entry.group.id, member.id)),
    ),
  );
  const link = magicLinkFor(member, appUrl());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader title="You" right={<MemberMenu member={member} manage={await currentManageHref()} />} />

      <Card asChild className="mx-4 gap-3">
        <section>
          <div className="flex items-center gap-3">
            <Pennant avatarId={member.avatarId} name={member.displayName} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-2xl">{member.displayName}</p>
              <Link href="/welcome" className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4">
                Edit name and pennant
              </Link>
            </div>
          </div>
        </section>
      </Card>

      <Card asChild className="mx-4 gap-2">
        <section>
          <p className={SECTION_LABEL}>Your personal link</p>
          <p className="text-sm text-muted-foreground">
            It signs you in on any phone, in every group you&rsquo;re in. Keep it to yourself.
          </p>
          <CopyButton text={link} label="Copy your personal link" className="self-start" />
        </section>
      </Card>

      <Card asChild className="mx-4 gap-3">
        <section>
          <p className={SECTION_LABEL}>Your groups</p>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You&rsquo;re not in a group yet. Open the Join Link your group shared, or start one.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry, i) => {
                const current = choice?.current.id === entry.group.id;
                return (
                  <li key={entry.group.id} className="space-y-1 py-3">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold">{entry.group.name}</p>
                      {entry.role === "organizer" ? <Badge variant="outline">Organizer</Badge> : null}
                      {current ? (
                        <Badge variant="outline">Showing</Badge>
                      ) : (
                        <form action={openGroupAction}>
                          <input type="hidden" name="groupId" value={entry.group.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Switch
                          </Button>
                        </form>
                      )}
                    </div>
                    {entry.role === "organizer" ? (
                      <Link
                        href={managePath(entry.group.id)}
                        className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4"
                      >
                        Manage {entry.group.name}
                      </Link>
                    ) : null}
                    {canLeave[i] ? (
                      <LeaveForm groupId={entry.group.id} groupName={entry.group.name} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        You&rsquo;re its only organizer. Make someone else an organizer before you leave.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="outline" className="self-start">
            <Link href="/start">Start a group</Link>
          </Button>
        </section>
      </Card>
    </main>
  );
}
