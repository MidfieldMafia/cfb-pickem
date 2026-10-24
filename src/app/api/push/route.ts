import { db } from "@/db";
import { currentMember } from "@/lib/members/current";
import { InvalidSubscription, rotateSubscription } from "@/lib/push/settings";

/**
 * `POST /api/push` with `{ subscription, replaces }`, from the service worker's
 * `pushsubscriptionchange`: the push service rotated this device's
 * subscription, so the new one takes the old one's place. A service worker
 * cannot call a server action, which is why this is a route.
 */
export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return Response.json({ error: "Sign in with your link first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { subscription?: unknown; replaces?: unknown } | null;
  try {
    const saved = await rotateSubscription(
      db(),
      member,
      body?.subscription,
      typeof body?.replaces === "string" ? body.replaces : null,
    );
    return Response.json({ saved });
  } catch (error) {
    if (error instanceof InvalidSubscription) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
