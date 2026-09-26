import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
import { isCommissioner } from "@/lib/members/members";
import { PUSH_KINDS, type PushPreferences } from "./payload";
import type { PushConfig } from "./sender";
import { memberSubscriptions, removeSubscription, saveSubscription, setPreferences } from "./subscriptions";

export interface PushRoute {
  db: Db;
  currentMember: () => Promise<Member | null>;
  /** null when push is not configured on this server. */
  config: PushConfig | null;
}

/** What the Notifications screen reads: whether push is on for the app, and this member's devices. */
export interface PushDeviceJson extends PushPreferences {
  endpoint: string;
  createdAt: string;
  userAgent: string | null;
}

export interface PushStateJson {
  enabled: boolean;
  publicKey: string | null;
  /** Whether the member is a commissioner, so the screen shows the commissioner switches. */
  commissioner: boolean;
  devices: PushDeviceJson[];
}

const NO_STORE = { "cache-control": "no-store" };
const refuse = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

/** Every switch on unless the body turned it off: a device that names none gets everything. */
function preferencesFrom(raw: unknown): PushPreferences {
  const p = (raw ?? {}) as Partial<Record<keyof PushPreferences, unknown>>;
  return Object.fromEntries(PUSH_KINDS.map((kind) => [kind, p[kind] !== false])) as PushPreferences;
}

async function state(route: PushRoute, member: Member): Promise<PushStateJson> {
  const devices = await memberSubscriptions(route.db, member);
  return {
    enabled: route.config !== null,
    publicKey: route.config?.publicKey ?? null,
    commissioner: isCommissioner(member),
    devices: devices.map((d) => ({
      endpoint: d.endpoint,
      chat: d.chat,
      finals: d.finals,
      close: d.close,
      feedback: d.feedback,
      review: d.review,
      rollCall: d.rollCall,
      createdAt: d.createdAt.toISOString(),
      userAgent: d.userAgent,
    })),
  };
}

async function withMember(route: PushRoute, body: (member: Member) => Promise<Response>): Promise<Response> {
  const member = await route.currentMember();
  if (!member) return refuse("Sign in with your link first.", 401);
  try {
    return await body(member);
  } catch (error) {
    if (error instanceof Refusal) return refuse(error.message, 400);
    throw error;
  }
}

async function json(request: Request): Promise<Record<string, unknown>> {
  try {
    return ((await request.json()) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** `GET /api/push`: push's availability and this member's devices. */
export function getPush(route: PushRoute): Promise<Response> {
  return withMember(route, async (member) => Response.json(await state(route, member), { headers: NO_STORE }));
}

/**
 * `POST /api/push` with `{ subscription, preferences?, replaces? }`: turns
 * notifications on for this device. `replaces` is the old endpoint when the
 * push service rotated it (see `pushsubscriptionchange` in `sw.js`).
 */
export function postPush(request: Request, route: PushRoute): Promise<Response> {
  return withMember(route, async (member) => {
    if (!route.config) return refuse("Notifications are not set up on this server.", 503);
    const body = await json(request);
    if (typeof body.replaces === "string") await removeSubscription(route.db, member, body.replaces);
    await saveSubscription(
      route.db,
      member,
      body.subscription,
      preferencesFrom(body.preferences),
      request.headers.get("user-agent"),
    );
    return Response.json(await state(route, member), { headers: NO_STORE });
  });
}

/** `PATCH /api/push` with `{ endpoint, preferences }`: changes what one device is told about. */
export function patchPush(request: Request, route: PushRoute): Promise<Response> {
  return withMember(route, async (member) => {
    const body = await json(request);
    if (typeof body.endpoint !== "string") return refuse("Which device?", 400);
    const row = await setPreferences(route.db, member, body.endpoint, preferencesFrom(body.preferences));
    if (!row) return refuse("That device is not one of yours.", 404);
    return Response.json(await state(route, member), { headers: NO_STORE });
  });
}

/** `DELETE /api/push` with `{ endpoint }`: turns notifications off for one device. */
export function deletePush(request: Request, route: PushRoute): Promise<Response> {
  return withMember(route, async (member) => {
    const body = await json(request);
    if (typeof body.endpoint !== "string") return refuse("Which device?", 400);
    await removeSubscription(route.db, member, body.endpoint);
    return Response.json(await state(route, member), { headers: NO_STORE });
  });
}
