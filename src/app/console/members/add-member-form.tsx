"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { SECTION_LABEL, Button, Card, Input } from "@saturday-slate/design-system";

import { MAX_DISPLAY_NAME, MAX_PHONE } from "@/lib/members/limits";
import { ActionMessage, type ActionState } from "../action-form";
import { addMemberAction } from "./actions";

/** Someone new, into the group chosen here. Someone already in the app is added from a group's Manage screen. */
export function AddMemberForm({ groups }: { groups: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMemberAction, {});

  return (
    <Card asChild className="rounded-md">
      <form action={action} key={state.done}>
      <p className={SECTION_LABEL}>Add a member</p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <label className="space-y-1 text-sm font-semibold">
          Name
          <Input name="displayName" required maxLength={MAX_DISPLAY_NAME} placeholder="Aunt Jo" autoComplete="off" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Phone number
          <Input name="phone" type="tel" required maxLength={MAX_PHONE} placeholder="(256) 555-0140" autoComplete="off" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Group
          <select
            name="groupId"
            required
            defaultValue={groups.length === 1 ? groups[0].id : ""}
            className="block h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="" disabled>
              Choose a group
            </option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          <UserPlus size={16} aria-hidden />
          {pending ? "Creating…" : "Create Magic Link"}
        </Button>
      </div>
      <ActionMessage state={state} />
      </form>
    </Card>
  );
}
