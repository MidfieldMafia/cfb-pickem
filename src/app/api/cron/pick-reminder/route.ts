import { after } from "next/server";
import { db } from "@/db";
import { reminderSendersFromEnv } from "@/lib/messaging/reminder-senders";
import { runScheduledReminder } from "@/lib/messaging/texts";
import { authorized } from "../auth";

/**
 * The Pick reminders' own ping: QStash calls it a day before the Deadline and
 * an hour before (`reminderSchedules` in `src/lib/results/heartbeat-windows.ts`),
 * and `runScheduledReminder` works out which of the two is due. Unlike
 * `/api/cron/remind` it sends nothing else. QStash sends POST; GET is here for
 * a manual `curl`. The sends run after the response.
 */
async function remind(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  after(async () => {
    const run = await runScheduledReminder(db(), reminderSendersFromEnv());
    console.info(
      run.ran
        ? `Reminder (${run.which}) for Week ${run.weekNumber}: pushed ${run.pushed.filter((p) => p.ok).length}, failed ` +
            `${run.pushed.filter((p) => !p.ok).length}, skipped ${run.skipped.length}.`
        : `No reminder: ${run.why}.`,
    );
  });
  return Response.json({ started: true });
}

export async function POST(request: Request) {
  return remind(request);
}

export async function GET(request: Request) {
  return remind(request);
}
