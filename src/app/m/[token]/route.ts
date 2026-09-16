import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { currentGroupId } from "@/lib/groups/current";
import { exchangeToken } from "@/lib/members/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/members/cookie";
import { currentWeek, landingRoute } from "@/lib/week/week";

/**
 * The Magic Link. Trades the token in the URL for a session cookie and sends
 * the member to the welcome page on their first visit, otherwise to wherever
 * the Week's state lands them (#91).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const signIn = await exchangeToken(db(), token);
  if (!signIn) return NextResponse.redirect(new URL("/expired", request.url));

  // `currentGroup()` is no use here: it reads the session cookie, and this
  // request is the one that sets it — on the response below. So the group is
  // resolved from the member the token just identified, with no remembered
  // value, which is also right for a first-ever visit on a new device.
  const destination = signIn.member.welcomedAt
    ? landingRoute(
        await currentWeek(db(), signIn.member, new Date(), {
          graded: true,
          group: await currentGroupId(db(), signIn.member.id, undefined),
        }),
      )
    : "/welcome";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(SESSION_COOKIE, signIn.sessionId, sessionCookieOptions());
  return response;
}
