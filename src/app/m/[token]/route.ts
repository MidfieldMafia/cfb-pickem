import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
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

  const destination = signIn.member.welcomedAt
    ? landingRoute(await currentWeek(db(), signIn.member, new Date(), { graded: true }))
    : "/welcome";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(SESSION_COOKIE, signIn.sessionId, sessionCookieOptions());
  return response;
}
