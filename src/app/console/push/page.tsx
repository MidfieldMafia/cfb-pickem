import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { requireConsole } from "@/lib/members/current";
import { listMembers } from "@/lib/members/members";
import { plural } from "@/lib/plural";
import { pushConfigFromEnv } from "@/lib/push/sender";
import { membersWithDevices } from "@/lib/push/settings";
import { PushForm } from "./push-form";

export default async function SendPush() {
  const commissioner = await requireConsole();
  const [roster, devices] = await Promise.all([listMembers(db(), commissioner), membersWithDevices(db())]);
  const recipients = roster
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, name: m.displayName, avatarId: m.avatarId, hasDevice: devices.has(m.id) }));
  const reachable = recipients.filter((m) => m.hasDevice).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1>Send a push</h1>
        <p className="text-sm text-muted-foreground">
          {plural(reachable, "member")} of {recipients.length} can take a push: Notifications on for a phone in Settings.
        </p>
      </div>
      {pushConfigFromEnv() ? null : (
        <p role="alert" className="text-sm font-semibold text-destructive">
          Push isn&apos;t set up on this server: the WEB_PUSH_* keys are unset, so nothing will send.
        </p>
      )}
      {/* A fresh id each render: a second press of the same form sends nothing twice. */}
      <PushForm members={recipients} sendId={randomUUID()} />
    </div>
  );
}
