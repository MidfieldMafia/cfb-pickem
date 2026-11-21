"use client";

import { startTransition, useActionState, useState } from "react";
import { Bell } from "lucide-react";
import { SECTION_LABEL, Button, Card, Checkbox, Input, Select, Textarea } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";
import { MAX_PUSH_BODY, MAX_PUSH_TITLE, PUSH_LINKS } from "@/lib/push/custom-fields";
import { ActionMessage, type ActionState } from "../action-form";
import { sendPushAction } from "./actions";

export interface Recipient {
  id: number;
  name: string;
  avatarId: string | null;
  /** Notifications are on for at least one of their phones. */
  hasDevice: boolean;
}

/**
 * Who to push, what it says and where a tap opens. Only a member with a phone
 * taking pushes can be ticked; the rest are listed, dimmed, so it is plain who
 * the push cannot reach. A sent push clears the form, so pressing Send again
 * starts a new push rather than repeating the last.
 */
export function PushForm({ members, sendId }: { members: Recipient[]; sendId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendPushAction, {});
  const reachable = members.filter((m) => m.hasDevice).map((m) => m.id);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState<string>(PUSH_LINKS[0].url);
  const [sent, setSent] = useState(state.done);

  // A send that went clears the form, once per answer. Every field is
  // controlled, so a refused send keeps all of it for another try.
  if (state.done !== sent) {
    setSent(state.done);
    if (state.done) {
      setChosen(new Set());
      setTitle("");
      setBody("");
      setUrl(PUSH_LINKS[0].url);
    }
  }

  const toggle = (id: number, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allChosen = reachable.length > 0 && reachable.every((id) => chosen.has(id));

  return (
    // Submitted by hand rather than `action={…}`: React resets a form after
    // its action, and a reset `<select>` does not come back to its state, so a
    // refused send would lose where a tap opens.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="sendId" value={sendId} />

      <Card asChild className="gap-3 rounded-md p-4">
        <section>
          <div className="flex items-center justify-between gap-2">
            <p className={SECTION_LABEL}>To · {chosen.size} chosen</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reachable.length === 0}
              onClick={() => setChosen(allChosen ? new Set() : new Set(reachable))}
            >
              {allChosen ? "Clear" : "Everyone with a phone"}
            </Button>
          </div>
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.id} className={`flex items-center gap-2 ${m.hasDevice ? "" : "opacity-60"}`}>
                <Checkbox
                  name="memberId"
                  value={m.id}
                  checked={chosen.has(m.id)}
                  disabled={!m.hasDevice}
                  onChange={(e) => toggle(m.id, e.target.checked)}
                  aria-label={m.hasDevice ? m.name : `${m.name}, no phone taking pushes`}
                />
                <Pennant avatarId={m.avatarId} name={m.name} size={28} />
                <span className="text-sm font-semibold">{m.name}</span>
                {m.hasDevice ? null : <span className="text-xs text-muted-foreground">no phone</span>}
              </li>
            ))}
          </ul>
        </section>
      </Card>

      <Card asChild className="gap-3 rounded-md p-4">
        <section>
          <p className={SECTION_LABEL}>The push</p>
          <label className="block space-y-1 text-sm font-semibold">
            <span className="flex justify-between">
              Title
              <span className="font-normal text-muted-foreground">
                {title.length}/{MAX_PUSH_TITLE}
              </span>
            </span>
            <Input
              name="title"
              required
              maxLength={MAX_PUSH_TITLE}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bowl picks are open"
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span className="flex justify-between">
              Message
              <span className="font-normal text-muted-foreground">
                {body.length}/{MAX_PUSH_BODY}
              </span>
            </span>
            <Textarea
              name="body"
              required
              rows={3}
              maxLength={MAX_PUSH_BODY}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Get yours in before Friday's kickoff."
            />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            A tap opens
            <Select name="url" value={url} onChange={(e) => setUrl(e.target.value)}>
              {PUSH_LINKS.map((link) => (
                <option key={link.url} value={link.url}>
                  {link.label}
                </option>
              ))}
            </Select>
          </label>

          {/* Roughly how it lands on a lock screen. */}
          <div aria-hidden className="flex gap-3 rounded-xl bg-muted p-3">
            <Bell size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title || "Title"}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{body || "Message"}</p>
            </div>
          </div>
        </section>
      </Card>

      <div className="space-y-2">
        <Button type="submit" size="default" disabled={pending || chosen.size === 0}>
          {pending ? "Sending…" : chosen.size === 1 ? "Send to 1 member" : `Send to ${chosen.size} members`}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
