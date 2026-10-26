import { after } from "next/server";
import { db } from "@/db";
import { reminderSendersFromEnv } from "@/lib/messaging/reminder-senders";
import { runScheduledReminder } from "@/lib/messaging/texts";
import { authorized } from "../auth";

/**
 * The scheduled reminder. Vercel Hobby runs it once a day (see `vercel.json`);
 * an external cron can call it more often with the same header, because a member
 * already sent this Week's reminder is never sent it twice. Only members with
 * the reminder on are reached, by push. The sends run after the response, so
 * the cron's request does not wait on the push services.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  after(async () => {
    const run = await runScheduledReminder(db(), reminderSendersFromEnv());
    console.info(
      run.ran
        ? `Reminder for Week ${run.weekNumber}: pushed ${run.pushed.filter((p) => p.ok).length}, failed ` +
            `${run.pushed.filter((p) => !p.ok).length}, skipped ${run.skipped.length}.`
        : `No reminder: ${run.why}.`,
    );
  });
  return Response.json({ started: true });
}
