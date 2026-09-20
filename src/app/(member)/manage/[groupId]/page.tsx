import { notFound } from "next/navigation";
import { db } from "@/db";
import { AppHeader, SECTION_LABEL, CopyButton, Badge, Card, Input } from "@saturday-slate/design-system";

import { MemberMenu } from "@/components/member-menu";
import { Pennant } from "@/components/pennant";

import { appUrl } from "@/lib/app-url";
import { currentManageHref } from "@/lib/groups/current";
import { joinLinkFor } from "@/lib/groups/join";
import { MAX_GROUP_NAME } from "@/lib/groups/limits";
import { manageGroup, manageView, NotOrganizer, type ManagedMember } from "@/lib/groups/manage";
import { requireMember } from "@/lib/members/current";
import { MAX_DISPLAY_NAME, MAX_PHONE } from "@/lib/members/limits";
import { deadlineInCentral } from "@/lib/picks/console";
import { safeInteger } from "@/lib/parse";
import { plural } from "@/lib/plural";
import { relativeTime } from "@/lib/relative-time";
import {
  addAction,
  addExistingAction,
  demoteAction,
  promoteAction,
  regenerateAction,
  removeAction,
  renameAction,
  resetJoinLinkAction,
  restoreAction,
} from "./actions";
import { ManageForm } from "./manage-form";

/**
 * Running one group: who has picked, their phone numbers, adding and removing
 * people, organizers, new Magic Links, and the group's name. Plain components
 * for now; the design pass dresses it.
 *
 * Someone who does not run the group gets a 404, as the console gives a
 * non-commissioner: the screen does not exist for them. Every button below is
 * only a convenience — `manage.ts` checks each edit again.
 */
export default async function Manage({ params }: { params: Promise<{ groupId: string }> }) {
  const member = await requireMember();
  const groupId = safeInteger((await params).groupId);
  if (groupId === null) notFound();
  const database = db();
  const manager = await manageGroup(database, member, groupId).catch((error: unknown) => {
    if (error instanceof NotOrganizer) notFound();
    throw error;
  });
  const view = await manageView(database, manager);
  const group = { groupId };
  const organizers = view.members.filter((m) => m.role === "organizer").length;
  const joinLink = joinLinkFor(manager.group, appUrl());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Manage"
        sub={`${view.group.name} · ${plural(view.members.length, "member")}`}
        right={<MemberMenu member={member} manage={await currentManageHref()} />}
      />

      <Card asChild className="mx-4 gap-3">
        <section>
          <p className={SECTION_LABEL}>
            {view.week ? `Week ${view.week.number} picks` : "Picks"}
          </p>
          {view.week ? (
            <p className="text-sm text-muted-foreground">
              {view.week.locked
                ? `Week ${view.week.number} is locked.`
                : `Picks lock ${deadlineInCentral(view.week.deadline)}.`}{" "}
              {manager.commissioner ? "" : "You see who has picked, never what."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No week is open yet.</p>
          )}
          <ul className="divide-y divide-border">
            {view.members.map((row) => (
              <MemberRow
                key={row.id}
                row={row}
                group={group}
                actorId={member.id}
                commissioner={manager.commissioner}
                lastOrganizer={row.role === "organizer" && organizers === 1}
              />
            ))}
          </ul>
        </section>
      </Card>

      <Card asChild className="mx-4 gap-3">
        <section>
          <p className={SECTION_LABEL}>Join Link</p>
          <p className="text-sm text-muted-foreground">
            Anyone who opens it joins {view.group.name}. Share it in your group chat.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{joinLink}</code>
            <CopyButton text={joinLink} />
          </div>
          <details>
            <summary className="flex min-h-tap cursor-pointer items-center text-sm font-semibold text-muted-foreground">
              Reset the Join Link
            </summary>
            <ManageForm action={resetJoinLinkAction} hidden={group} submit="Reset the link" pendingLabel="Resetting…" variant="destructive">
              <p className="text-xs text-muted-foreground">
                The old link stops working for anyone who hasn&rsquo;t joined yet. Nobody in the group is removed.
              </p>
            </ManageForm>
          </details>
        </section>
      </Card>

      <Card asChild className="mx-4 gap-3">
        <section>
          <p className={SECTION_LABEL}>Add someone new</p>
          <ManageForm action={addAction} hidden={group} submit="Add and make their link" pendingLabel="Adding…" variant="default">
            <label className="block space-y-1 text-sm font-semibold">
              Name
              <Input name="displayName" required maxLength={MAX_DISPLAY_NAME} autoComplete="off" />
            </label>
            <label className="block space-y-1 text-sm font-semibold">
              Phone number
              <Input name="phone" type="tel" required maxLength={MAX_PHONE} autoComplete="off" />
            </label>
          </ManageForm>
        </section>
      </Card>

      {/* A commissioner's power only: an organizer's people come in through the
          Join Link. `addable` is always empty for an organizer anyway. */}
      {manager.commissioner && view.addable.length > 0 ? (
        <Card asChild className="mx-4 gap-3">
          <section>
            <p className={SECTION_LABEL}>Add someone already playing</p>
            <ManageForm action={addExistingAction} hidden={group} submit="Add to group" pendingLabel="Adding…">
              <select
                name="memberId"
                required
                defaultValue=""
                aria-label="Who to add"
                className="block h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="" disabled>
                  Choose someone
                </option>
                {view.addable.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Only weeks from today on count for them here. Someone removed from this group is restored below instead.
              </p>
            </ManageForm>
          </section>
        </Card>
      ) : null}

      {view.removed.length > 0 ? (
        <Card asChild className="mx-4 gap-3">
          <section>
            <p className={SECTION_LABEL}>Removed</p>
            <ul className="divide-y divide-border">
              {view.removed.map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-2">
                  <Pennant avatarId={row.avatarId} name={row.displayName} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{row.displayName}</p>
                    <p className="text-xs text-muted-foreground">Removed {relativeTime(row.removedAt)}</p>
                  </div>
                  <ManageForm
                    action={restoreAction}
                    hidden={{ ...group, memberId: row.id }}
                    submit="Restore"
                    pendingLabel="Restoring…"
                  />
                </li>
              ))}
            </ul>
          </section>
        </Card>
      ) : null}

      <Card asChild className="mx-4 gap-3">
        <section>
          <p className={SECTION_LABEL}>Group name</p>
          <ManageForm action={renameAction} hidden={group} submit="Rename" pendingLabel="Renaming…">
            <Input name="name" required maxLength={MAX_GROUP_NAME} defaultValue={view.group.name} autoComplete="off" />
          </ManageForm>
        </section>
      </Card>
    </main>
  );
}

/**
 * One member: progress and phone in the open, the edits behind a disclosure so
 * a phone-width list stays a list. Only the buttons this actor may use are drawn.
 */
function MemberRow({
  row,
  group,
  actorId,
  commissioner,
  lastOrganizer,
}: {
  row: ManagedMember;
  group: { groupId: number };
  actorId: number;
  commissioner: boolean;
  lastOrganizer: boolean;
}) {
  const hidden = { ...group, memberId: row.id };
  const self = row.id === actorId;
  const organizer = row.role === "organizer";
  const canRemove = commissioner || !organizer;
  const canDemote = organizer && (commissioner || (self && !lastOrganizer));
  const canRegenerate = commissioner || (!organizer && !row.commissioner);
  // An organizer's own row, with another organizer beside them, is the only one
  // that can have nothing to offer: no promote, no step down, no link, no remove.
  const anything = !organizer || canDemote || canRegenerate || canRemove;

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <Pennant avatarId={row.avatarId} name={row.displayName} size={28} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {row.displayName}
            {organizer ? <Badge variant="outline">Organizer</Badge> : null}
            {row.active ? null : <Badge variant="outline">Deactivated</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : "No phone"}
          </p>
        </div>
        {row.reminder ? (
          <Badge variant={row.reminder.status === "Done" ? "win" : "pending"}>
            {row.reminder.picksMade} of {row.reminder.liveGames}
          </Badge>
        ) : null}
      </div>

      {row.reminder ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          <dt className="text-muted-foreground">Lock of the Week</dt>
          <dd>
            {row.reminder.lockSet ? "Set" : "Not set"}
            {row.revealed?.lockTeam ? ` · ${row.revealed.lockTeam}` : ""}
          </dd>
          <dt className="text-muted-foreground">Tiebreaker Guess</dt>
          <dd>
            {row.reminder.guessSet ? "Set" : "Not set"}
            {row.revealed?.guess != null ? ` · ${row.revealed.guess}` : ""}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-semibold">{row.reminder.status}</dd>
        </dl>
      ) : null}

      {anything ? (
      <details>
        <summary className="flex min-h-tap cursor-pointer items-center text-sm font-semibold text-muted-foreground">
          More for {row.displayName}
        </summary>
        <div className="flex flex-col gap-3 pt-2">
          {organizer ? null : (
            <ManageForm action={promoteAction} hidden={hidden} submit="Make organizer" pendingLabel="Promoting…" />
          )}
          {canDemote ? (
            <ManageForm
              action={demoteAction}
              hidden={hidden}
              submit={self ? "Step down as organizer" : "Remove organizer role"}
              pendingLabel="Stepping down…"
            />
          ) : null}
          {canRegenerate ? (
            <ManageForm
              action={regenerateAction}
              hidden={hidden}
              submit="Make a new Magic Link"
              pendingLabel="Making…"
            >
              <p className="text-xs text-muted-foreground">
                Their old link stops working and they are signed out everywhere.
              </p>
            </ManageForm>
          ) : null}
          {canRemove ? (
            <ManageForm action={removeAction} hidden={hidden} submit="Remove from group" pendingLabel="Removing…" variant="destructive">
              <p className="text-xs text-muted-foreground">
                They disappear from this group&rsquo;s boards, past weeks included. You can restore them.
              </p>
            </ManageForm>
          ) : null}
        </div>
      </details>
      ) : null}
    </li>
  );
}
