import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { db } from "@/db";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SECTION_LABEL } from "@/components/section-label";
import { listGroups } from "@/lib/groups/console";
import { leftWithoutGroupWarning } from "@/lib/groups/console-edits";
import { MAX_GROUP_NAME } from "@/lib/groups/limits";
import { managePath } from "@/lib/groups/manage-state";
import { requireConsole } from "@/lib/members/current";
import { plural } from "@/lib/plural";
import { ActionForm } from "../action-form";
import { createGroupAction } from "./actions";
import { DeleteGroupForm } from "./delete-group-form";

/**
 * Every group at once. Each opens its Manage screen, where a commissioner has
 * every organizer power and more; this screen only starts and deletes groups.
 */
export default async function Groups() {
  const commissioner = await requireConsole();
  const groups = await listGroups(db(), commissioner);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1>Groups</h1>
        <p className="text-sm text-muted-foreground">{plural(groups.length, "group")}</p>
      </div>

      <Card className="rounded-md">
        <p className={SECTION_LABEL}>Start a group</p>
        <p className="text-sm text-muted-foreground">
          You don&rsquo;t join it. Open it afterwards to add people and make someone its organizer.
        </p>
        <ActionForm action={createGroupAction} hidden={{}} submit="Create group" pendingLabel="Creating…" variant="default" size="default">
          <Input name="name" required maxLength={MAX_GROUP_NAME} placeholder="Office pool" aria-label="Group name" autoComplete="off" className="max-w-xs" />
        </ActionForm>
      </Card>

      <Card className="gap-0 overflow-x-auto rounded-md p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="p-3">Group</th>
              <th className="p-3">Members</th>
              <th className="p-3">Organizers</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group) => (
              <tr key={group.id}>
                <td className="p-3 font-semibold">
                  <Link href={managePath(group.id)}>{group.name}</Link>
                </td>
                <td className="p-3 whitespace-nowrap">{group.members}</td>
                <td className="p-3 text-muted-foreground">
                  {group.organizers.length > 0 ? group.organizers.join(", ") : "None"}
                </td>
                <td className="p-3">
                  <div className="flex items-start justify-end gap-1">
                    <Link
                      href={managePath(group.id)}
                      className="tap inline-flex items-center rounded-md border border-border px-3 text-sm font-semibold no-underline hover:bg-accent"
                    >
                      Manage
                    </Link>
                    {/* Behind the overflow, as deleting a member is: never one
                        stray click from the button every row uses. */}
                    <details className="text-right">
                      <summary
                        aria-label={`More for ${group.name}`}
                        className="flex size-tap cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </summary>
                      <div className="mt-1">
                        <DeleteGroupForm
                          groupId={group.id}
                          name={group.name}
                          warning={`Removes ${plural(group.members, "member")} from it. ${leftWithoutGroupWarning(group.leftWithoutGroup)}`}
                        />
                      </div>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
