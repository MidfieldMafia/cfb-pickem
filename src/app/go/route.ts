import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { CURRENT_GROUP_COOKIE, currentGroupCookieOptions } from "@/lib/groups/current";
import { goTarget } from "@/lib/groups/go";
import { currentMember } from "@/lib/members/current";

/**
 * `GET /go?group=<id>&to=<path>`, the link a push opens (#529): switches this
 * device to the group when it is still the member's, then opens the path in
 * this app. `goTarget` says what it checks.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const member = await currentMember();
  const { group, path } = await goTarget(db(), member?.id ?? null, params.get("group"), params.get("to"));
  const response = NextResponse.redirect(new URL(path, request.url));
  if (group !== null) response.cookies.set(CURRENT_GROUP_COOKIE, String(group), currentGroupCookieOptions());
  return response;
}
