/**
 * A commissioner's own push (the console's Send a push screen): a title, a
 * line under it and where a tap opens, to the members they tick.
 *
 * No setting of the member's is read. They turned Notifications on for a
 * phone, and a commissioner picked them by name; a member with no device is
 * named as not reached rather than refused, so one stale phone never blocks the
 * rest. Deactivated members are never sent to.
 *
 * Each member's push is reserved under `custom:<sendId>:<member>`, the send id
 * coming from the form as the screen rendered it, so a second press of the
 * same form sends nothing twice. A push no device took gives its key back.
 */
import "server-only";
import { inArray } from "drizzle-orm";
import { members, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
import { MAX_PUSH_BODY, MAX_PUSH_TITLE, PUSH_LINKS } from "./custom-fields";
import { pushToMember } from "./deliver";
import { release, reserve } from "./reservations";
import type { Pusher, PushPayload } from "./sender";
import { membersWithDevices } from "./settings";

export class InvalidPush extends Refusal {}

/** A day: an announcement is stale by the next one. */
export const CUSTOM_TTL = 24 * 60 * 60;

export const customPushKey = (sendId: string, memberId: number) => `custom:${sendId}:${memberId}`;

export interface CustomPush {
  title: string;
  body: string;
  url: string;
  memberIds: number[];
  /** One per rendering of the form; see the header. */
  sendId: string;
}

export interface CustomPushResult {
  /** At least one of their devices took it. */
  reached: Member[];
  /** No device saved, or none took it. */
  missed: Member[];
  /** Already sent under this send id: the form was pressed twice. */
  repeated: Member[];
}

/** What the form posted, checked: a refusal names the field to fix. */
export function cleanCustomPush(raw: CustomPush): CustomPush {
  const title = raw.title.trim();
  const body = raw.body.trim();
  if (!title) throw new InvalidPush("Give the push a title.");
  if (title.length > MAX_PUSH_TITLE) throw new InvalidPush(`Keep the title to ${MAX_PUSH_TITLE} characters.`);
  if (!body) throw new InvalidPush("Write the message.");
  if (body.length > MAX_PUSH_BODY) throw new InvalidPush(`Keep the message to ${MAX_PUSH_BODY} characters.`);
  if (!PUSH_LINKS.some((link) => link.url === raw.url)) throw new InvalidPush("Choose where a tap opens.");
  const memberIds = [...new Set(raw.memberIds)];
  if (memberIds.length === 0) throw new InvalidPush("Choose at least one member.");
  if (!/^[\w-]{8,64}$/.test(raw.sendId)) throw new InvalidPush("Reload the page and send again.");
  return { title, body, url: raw.url, memberIds, sendId: raw.sendId };
}

/** Sends the push to each chosen, active member on every device they have, and says who it reached. */
export async function sendCustomPush(db: Db, pusher: Pusher, raw: CustomPush, now: Date = new Date()): Promise<CustomPushResult> {
  const push = cleanCustomPush(raw);
  const [chosen, devices] = await Promise.all([
    db.select().from(members).where(inArray(members.id, push.memberIds)),
    membersWithDevices(db),
  ]);
  const recipients = chosen.filter((m) => m.active);
  if (recipients.length !== push.memberIds.length) throw new InvalidPush("Someone chosen is no longer an active member. Reload the page.");
  const payload: PushPayload = { title: push.title, body: push.body, url: push.url, tag: `custom-${push.sendId}` };
  const result: CustomPushResult = { reached: [], missed: [], repeated: [] };
  await Promise.all(
    recipients.map(async (m) => {
      if (!devices.has(m.id)) return result.missed.push(m);
      const key = customPushKey(push.sendId, m.id);
      if (!(await reserve(db, key))) return result.repeated.push(m);
      const { sent } = await pushToMember(db, pusher, m.id, payload, { ttl: CUSTOM_TTL }, now);
      if (sent > 0) return result.reached.push(m);
      await release(db, key);
      result.missed.push(m);
    }),
  );
  const byName = (a: Member, b: Member) => a.displayName.localeCompare(b.displayName);
  return { reached: result.reached.sort(byName), missed: result.missed.sort(byName), repeated: result.repeated.sort(byName) };
}

const names = (list: Member[]) => {
  const all = list.map((m) => m.displayName);
  return all.length <= 2 ? all.join(" and ") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
};

/** The sentence under the Send button. */
export function customPushSummary({ reached, missed, repeated }: CustomPushResult): string {
  const parts: string[] = [];
  if (reached.length) parts.push(`Pushed ${names(reached)}.`);
  if (missed.length) parts.push(`${names(missed)} ${missed.length === 1 ? "has" : "have"} no phone taking pushes.`);
  if (repeated.length) parts.push(`Already sent to ${names(repeated)}.`);
  return parts.join(" ") || "Nobody was pushed.";
}
