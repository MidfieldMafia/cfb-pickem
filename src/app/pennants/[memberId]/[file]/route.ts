import { db } from "@/db";
import { currentMember } from "@/lib/members/current";
import { servePhoto } from "@/lib/members/photos";

/** A member's photo pennant. `findAvatar` resolves `photo-<memberId>-<hash8>` to this URL. */
export async function GET(_request: Request, ctx: RouteContext<"/pennants/[memberId]/[file]">) {
  return servePhoto({ db: db(), currentMember }, await ctx.params);
}
