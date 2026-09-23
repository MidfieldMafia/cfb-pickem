import { db } from "@/db";
import { serveScreenshot } from "@/lib/feedback/feedback";
import { currentMember } from "@/lib/members/current";

/** A Feedback's screenshot, for commissioners only and never cached. Compare the pennant route, which is the opposite. */
export async function GET(_request: Request, ctx: RouteContext<"/console/feedback/[id]/screenshot">) {
  return serveScreenshot({ db: db(), currentMember }, await ctx.params);
}
