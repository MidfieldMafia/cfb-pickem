import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { db } from "@/db";
import { Card, Input, SECTION_LABEL, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@saturday-slate/design-system";

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

      <Card className="gap-0 overflow-hidden rounded-md p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead variant="caps">Group</TableHead>
              <TableHead variant="caps">Members</TableHead>
              <TableHead variant="caps">Organizers</TableHead>
              <TableHead variant="caps" className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell className="font-semibold">
                  <Link href={managePath(group.id)}>{group.name}</Link>
                </TableCell>
                <TableCell>{group.members}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {group.organizers.length > 0 ? group.organizers.join(", ") : "None"}
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
