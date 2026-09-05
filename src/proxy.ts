import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/members/cookie";

/**
 * Cheap front gate: signed-out visitors never render member or console
 * pages. Pages and server actions still verify the session against the
 * database; this only checks that a cookie exists.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/welcome", "/week/:path*", "/console/:path*"],
};
