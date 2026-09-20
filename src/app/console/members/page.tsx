import Link from "next/link";
import { MoreHorizontal, RefreshCw, Shield } from "lucide-react";
import { db } from "@/db";
import { Badge, Button, Card, Input, CopyButton } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";
import { appUrl } from "@/lib/app-url";
import { groupsByMember, listGroups } from "@/lib/groups/console";
import { managePath } from "@/lib/groups/manage-state";
import { requireConsole } from "@/lib/members/current";
import { deleteWarning } from "@/lib/members/console-edits";
import { MAX_PHONE } from "@/lib/members/limits";
import { listMembers, magicLinkFor, pickCountByMember } from "@/lib/members/members";
import { plural } from "@/lib/plural";
import { relativeTime } from "@/lib/relative-time";
import { deleteMemberAction, editPhoneAction, regenerateAction, setActiveAction } from "./actions";
import { AddMemberForm } from "./add-member-form";
import { ActionForm } from "../action-form";

function maskedLink(link: string): string {
  const url = new URL(link);
  return `${url.host}/m/••••${url.pathname.slice(-4)}`;
}

export default async function Members() {
  const commissioner = await requireConsole();
  const [roster, pickCounts, groups, groupsOf] = await Promise.all([
    listMembers(db(), commissioner),
    pickCountByMember(db(), commissioner),
    listGroups(db(), commissioner),
    groupsByMember(db(), commissioner),
  ]);
  const base = appUrl();
  const commissioners = roster.filter((m) => m.isCommissioner).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1>Members</h1>
        <p className="text-sm text-muted-foreground">
          {plural(roster.length, "member")} · {plural(commissioners, "commissioner")}
        </p>
      </div>

      <AddMemberForm groups={groups.map(({ id, name }) => ({ id, name }))} />

      <Card className="gap-0 overflow-x-auto rounded-md p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="p-3">Member</th>
              <th className="p-3">Role and groups</th>
              <th className="p-3">Magic Link</th>
              <th className="p-3">Last opened</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roster.map((member) => {
              const link = magicLinkFor(member, base);
              return (
                <tr key={member.id} className={member.active ? "" : "opacity-60"}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <Pennant avatarId={member.avatarId} name={member.displayName} size={36} />
                      <div>
                        <p className="font-semibold">{member.displayName}</p>
                        <p className="text-xs text-muted-foreground">{member.phone ?? "No phone yet"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {member.isCommissioner ? (
                        <Badge className="bg-secondary text-secondary-foreground">
                          <Shield size={12} aria-hidden />
                          Commissioner
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Member</span>
                      )}
                      {member.active ? null : <Badge variant="outline">Deactivated</Badge>}
                    </div>
                    {/* Their groups now, each opening its Manage screen. A
                        column of its own pushed Actions off a laptop screen. */}
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {(groupsOf.get(member.id) ?? []).map((group) => (
                        <li key={group.id} className="whitespace-nowrap">
                          <Link href={managePath(group.id)}>{group.name}</Link>
                          {group.role === "organizer" ? (
                            <span className="text-muted-foreground"> · organizer</span>
                          ) : null}
                        </li>
                      ))}
                      {groupsOf.has(member.id) ? null : <li className="text-muted-foreground">No group</li>}
                    </ul>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-xs whitespace-nowrap">{maskedLink(link)}</code>
                      <CopyButton text={link} />
                    </div>
                  </td>
                  {/* The column says "Last opened"; the cell need not say it again. */}
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {member.lastSeenAt ? relativeTime(member.lastSeenAt) : "Never"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <form action={regenerateAction}>
                        <input type="hidden" name="memberId" value={member.id} />
                        <Button type="submit" variant="outline" size="sm">
                          <RefreshCw size={14} aria-hidden />
                          Regenerate
                        </Button>
                      </form>
                      {/* Deactivating is rare and cannot be undone from the
                          member's side, so it sits behind the overflow rather
                          than one stray click from a destructive button in
                          every row. The phone edit sits there too, so a
                          commissioner's own row has an overflow for it even
                          though they cannot deactivate themselves. */}
                      <details className="text-right">
                        <summary
                          aria-label={`More for ${member.displayName}`}
                          className="flex size-tap cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                        >
                          <MoreHorizontal size={16} aria-hidden />
                        </summary>
                        <div className="mt-1 flex flex-col items-end gap-2">
                          <ActionForm
                            action={editPhoneAction}
                            hidden={{ memberId: member.id }}
                            submit="Save phone"
                            pendingLabel="Saving…"
                            className="space-y-1 text-right"
                          >
                            <Input
                              name="phone"
                              type="tel"
                              maxLength={MAX_PHONE}
                              defaultValue={member.phone ?? ""}
                              aria-label={`Phone number for ${member.displayName}`}
                              placeholder="Blank clears it"
                              autoComplete="off"
                              className="w-44"
                            />
                          </ActionForm>
                          {member.id === commissioner.id ? null : (
                            <form action={setActiveAction}>
                              <input type="hidden" name="memberId" value={member.id} />
                              <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                              <Button type="submit" variant={member.active ? "destructive" : "secondary"} size="sm">
                                {member.active ? "Deactivate" : "Reactivate"}
                              </Button>
                            </form>
                          )}
                          {/* Deleting is only offered once they are deactivated,
                              so the irreversible step is never one click from
                              the reversible one, and the sentence says what
                              goes with them before the button does it. */}
                          {member.active ? null : (
                            <ActionForm
                              action={deleteMemberAction}
                              hidden={{ memberId: member.id }}
                              submit="Delete"
                              pendingLabel="Deleting…"
                              variant="destructive"
                              className="space-y-1 text-right"
                            >
                              <span className="max-w-56 text-xs text-muted-foreground">
                                {deleteWarning(pickCounts.get(member.id) ?? 0)}
                              </span>
                            </ActionForm>
                          )}
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
