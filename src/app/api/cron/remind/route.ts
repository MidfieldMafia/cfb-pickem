import { after } from "next/server";
import { db } from "@/db";
import { cfbd } from "@/lib/cfbd";
import { reminderSendersFromEnv } from "@/lib/messaging/reminder-senders";
import { runScheduledReminder } from "@/lib/messaging/texts";
import { runWeeklyWinPush } from "@/lib/results/weekly-win-push";
import { authorized } from "../auth";

/**
 * The 16:00 UTC daily job (see `vercel.json`): the scheduled reminder, then
 * the Weekly Win push (#532). An external cron can call it more often with the
 * same header, because each push is reserved before it is sent and never sent
 * twice. Only members with the kind on are reached, by push. The sends run
 * after the response, so the cron's request does not wait on the push services.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  after(async () => {
    const senders = reminderSendersFromEnv();
    const run = await runScheduledReminder(db(), senders);
    console.info(
      run.ran
        ? `Reminder for Week ${run.weekNumber}: pushed ${run.pushed.filter((p) => p.ok).length}, failed ` +
            `${run.pushed.filter((p) => !p.ok).length}, skipped ${run.skipped.length}.`
        : `No reminder: ${run.why}.`,
    );
    const win = await runWeeklyWinPush(db(), senders.push, cfbd);
    console.info(
      win.ran
        ? `Weekly Win for Week ${win.weekNumber}: pushed ${win.sent.filter((s) => s.sent > 0).length} of ${win.sent.length}.`
        : `No Weekly Win push: ${win.why}.`,
    );
  });
  return Response.json({ started: true });
}
