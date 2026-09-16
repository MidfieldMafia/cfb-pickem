import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { CURRENT_GROUP_COOKIE, currentGroupCookieOptions } from "@/lib/groups/current";
import { groupForJoinLink, joinStanding } from "@/lib/groups/join";
import { currentMember } from "@/lib/members/current";

/**
 * A current member opening their own group's Join Link: this device switches to
 * that group and lands on the boards. Anyone else is sent back to the Join Link,
 * which decides what they see — so nothing here can put a person in a group.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const [group, member] = await Promise.all([groupForJoinLink(db(), token), currentMember()]);
  if (!group || !member || (await joinStanding(db(), member.id, group.id)) !== "in") {
    return NextResponse.redirect(new URL(`/join/${encodeURIComponent(token)}`, request.url));
  }
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(CURRENT_GROUP_COOKIE, String(group.id), currentGroupCookieOptions());
  return response;
}
