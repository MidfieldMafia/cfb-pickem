import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pennant } from "@/components/pennant";
import { appUrl } from "@/lib/app-url";
import { requireConsole } from "@/lib/members/current";
import { listMembers, magicLinkFor } from "@/lib/members/members";
import { relativeTime } from "@/lib/relative-time";
import { regenerateAction, setActiveAction } from "./actions";
import { AddMemberForm } from "./add-member-form";
import { CopyLinkButton } from "./copy-link-button";

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
          {roster.length} member{roster.length === 1 ? "" : "s"} · {commissioners} commissioner
          {commissioners === 1 ? "" : "s"}
        </p>
      </div>

      <AddMemberForm />

      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {roster.map((member) => {
          const link = magicLinkFor(member, base);
          return (
            <li
              key={member.id}
              className={`grid gap-3 p-3 md:grid-cols-[minmax(10rem,1.2fr)_8rem_minmax(14rem,1.5fr)_8rem_auto] md:items-center ${
                member.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Pennant avatarId={member.avatarId} size={44} />
                <div>
                  <p className="font-semibold">{member.displayName}</p>
                  <p className="text-xs text-muted-foreground">{member.phone ?? "No phone yet"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {member.isCommissioner ? (
                  <Badge className="bg-secondary text-secondary-foreground">Commissioner</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">Member</span>
                )}
                {member.active ? null : <Badge variant="outline">Deactivated</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-xs">{maskedLink(link)}</code>
                <CopyLinkButton link={link} />
              </div>
              <p className="text-sm text-muted-foreground">
                {member.lastSeenAt ? `Opened ${relativeTime(member.lastSeenAt)}` : "Never opened"}
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={regenerateAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Regenerate
                  </Button>
                </form>
                {member.id === commissioner.id ? null : (
                  <form action={setActiveAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <input type="hidden" name="active" value={member.active ? "false" : "true"} />
                    <Button type="submit" variant={member.active ? "destructive" : "secondary"} size="sm">
                      {member.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
