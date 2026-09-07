import { MoreHorizontal, RefreshCw, Shield } from "lucide-react";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pennant } from "@/components/pennant";
import { appUrl } from "@/lib/app-url";
import { requireConsole } from "@/lib/members/current";
import { listMembers, magicLinkFor } from "@/lib/members/members";
import { plural } from "@/lib/plural";
import { relativeTime } from "@/lib/relative-time";
import { regenerateAction, setActiveAction } from "./actions";
import { AddMemberForm } from "./add-member-form";
import { CopyButton } from "@/components/copy-button";

function maskedLink(link: string): string {
  const url = new URL(link);
  return `${url.host}/m/••••${url.pathname.slice(-4)}`;
}

export default async function Members() {
  const commissioner = await requireConsole();
  const roster = await listMembers(db(), commissioner);
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

      <AddMemberForm />

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th className="p-3">Member</th>
              <th className="p-3">Role</th>
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
                      <Pennant avatarId={member.avatarId} size={36} />
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
                          every row. A commissioner cannot deactivate
                          themselves, so their row has no overflow at all. */}
                      {member.id === commissioner.id ? null : (
                        <details className="text-right">
                          <summary
                            aria-label={`More for ${member.displayName}`}
                            className="flex size-tap cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </summary>
                          <form action={setActiveAction} className="mt-1">
                            <input type="hidden" name="memberId" value={member.id} />
                            <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                            <Button type="submit" variant={member.active ? "destructive" : "secondary"} size="sm">
                              {member.active ? "Deactivate" : "Reactivate"}
                            </Button>
                          </form>
                        </details>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
