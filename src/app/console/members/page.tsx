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
import { NOOP, senderFromEnv } from "@/lib/messaging/sender";
import { recentTexts, textBudget } from "@/lib/messaging/texts";
import { listMembers, magicLinkFor, pickCountByMember } from "@/lib/members/members";
import { plural } from "@/lib/plural";
import { relativeTime } from "@/lib/relative-time";
import { deleteMemberAction, editPhoneAction, optOutAction, regenerateAction, setActiveAction, textMagicLinkAction } from "./actions";
import { AddMemberForm } from "./add-member-form";
import { ActionForm } from "../action-form";

const TEXT_KINDS = { magic_link: "sign-in link", reminder: "reminder", scheduled_reminder: "scheduled reminder" };

function maskedLink(link: string): string {
  const url = new URL(link);
  return `${url.host}/m/••••${url.pathname.slice(-4)}`;
}

export default async function Members() {
  const commissioner = await requireConsole();
  const sender = senderFromEnv();
  const [roster, pickCounts, groups, groupsOf, texts, budget] = await Promise.all([
    listMembers(db(), commissioner),
    pickCountByMember(db(), commissioner),
    listGroups(db(), commissioner),
    groupsByMember(db(), commissioner),
    recentTexts(db(), commissioner),
    textBudget(db(), sender, new Date()),
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
                        <p className="text-xs text-muted-foreground">
                          {member.phone ?? "No phone yet"}
                          {member.smsOptedOut ? " · opted out of texts" : ""}
                        </p>
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
                      <ActionForm
                        action={textMagicLinkAction}
                        hidden={{ memberId: member.id }}
                        submit="Text link"
                        pendingLabel="Texting…"
                        className="space-y-1 text-right"
                      />
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
                          <ActionForm
                            action={optOutAction}
                            hidden={{ memberId: member.id, optedOut: member.smsOptedOut ? "false" : "true" }}
                            submit={member.smsOptedOut ? "Text them again" : "Mark opted out of texts"}
                            pendingLabel="Saving…"
                            className="space-y-1 text-right"
                          />
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

      <Card className="gap-0 rounded-md p-0">
        <div className="border-b border-border p-3">
          <p className="font-semibold">Recent texts</p>
          <p className="text-xs text-muted-foreground">
            {sender.name === NOOP
              ? "No PINGRAM_API_KEY is set, so texts are logged but not delivered."
              : `${budget.used} of ${budget.budget} texts used this month.`}
          </p>
        </div>
        <ul className="divide-y divide-border text-sm">
          {texts.map((text) => (
            <li key={text.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
              <span>
                <span className="font-semibold">{text.memberName}</span> · {TEXT_KINDS[text.kind]}
                {text.ok ? null : <span className="font-semibold text-destructive"> · failed: {text.detail}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{relativeTime(text.createdAt)}</span>
            </li>
          ))}
          {texts.length === 0 ? <li className="p-3 text-muted-foreground">No texts sent yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
