import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import type { Member } from "@/db/schema";
import { getSession } from "./auth";
import { SESSION_COOKIE } from "./cookie";

/**
 * The signed-in member for this request, or null. Reads the session cookie.
 * Cached per request, because a console layout and its page both ask.
 */
export const currentMember = cache(async (): Promise<Member | null> => {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  return getSession(db(), sessionId);
});

/** For member pages: bounce signed-out visitors to the front door. */
export async function requireMember(): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect("/");
  return member;
}

/** For console pages and actions: the console does not exist for non-commissioners. */
export async function requireConsole(): Promise<Member> {
  const member = await requireMember();
  if (!member.isCommissioner) notFound();
  return member;
}
