import { db } from "@/db";
import { applyPingramEvent } from "@/lib/messaging/opt-outs";

/**
 * Pingram's Events Webhook, subscribed to `SMS_UNSUBSCRIBE` and
 * `SMS_SUBSCRIBE` in its dashboard with the signing secret in
 * `PINGRAM_WEBHOOK_SECRET`. A delivery Pingram did not sign is refused; every
 * other one is answered 200, so an event the app has no use for is not retried.
 */
export async function POST(request: Request) {
  const outcome = await applyPingramEvent(
    db(),
    {
      payload: await request.text(),
      id: request.headers.get("x-pingram-id") ?? "",
      timestamp: request.headers.get("x-pingram-timestamp") ?? "",
      signature: request.headers.get("x-pingram-signature") ?? "",
    },
    process.env.PINGRAM_WEBHOOK_SECRET,
  );
  if (outcome === "unsigned") return new Response("Unauthorized", { status: 401 });
  return Response.json({ outcome });
}
