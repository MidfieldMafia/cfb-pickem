import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { exchangeToken } from "@/lib/members/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/members/cookie";

/**
 * The Magic Link. Trades the token in the URL for a session cookie and sends
 * the member to the welcome page on their first visit, otherwise to the week.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const signIn = await exchangeToken(db(), token);
  if (!signIn) return NextResponse.redirect(new URL("/expired", request.url));

  const response = NextResponse.redirect(
    new URL(signIn.landing === "welcome" ? "/welcome" : "/week", request.url),
  );
  response.cookies.set(SESSION_COOKIE, signIn.sessionId, sessionCookieOptions());
  return response;
}
