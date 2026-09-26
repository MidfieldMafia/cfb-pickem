import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import { senderFromEnv } from "@/lib/messaging/sender";
import { runScheduledReminder } from "@/lib/messaging/texts";
import { authorized } from "../auth";

/**
 * The scheduled reminder. Vercel Hobby runs it once a day (see `vercel.json`);
 * an external cron can call it more often with the same header, because a member
 * already sent this Week's reminder is never sent it twice.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const run = await runScheduledReminder(db(), senderFromEnv(), appUrl());
  if (!run.ran) return Response.json({ ran: false, why: run.why });
  return Response.json({
    ran: true,
    week: run.weekNumber,
    texted: run.texted.filter((t) => t.ok).length,
    failed: run.texted.filter((t) => !t.ok).length,
    skipped: run.skipped.length,
  });
}
