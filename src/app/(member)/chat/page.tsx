import { AppHeader } from "@saturday-slate/design-system";
import { db } from "@/db";
import { GroupSwitcher } from "@/components/group-switcher";
import { MemberMenu } from "@/components/member-menu";
import { NoGroup } from "@/components/no-group";
import { chatThread, markRead } from "@/lib/chat/chat";
import { toChatStateJson } from "@/lib/chat/json";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { groupBoard } from "@/lib/groups/memberships";
import { requireMember } from "@/lib/members/current";
import { plural } from "@/lib/plural";
import { toMemberJson } from "@/lib/slate/json";
import { ChatThread } from "./chat-thread";

/**
 * Chat (#248): the Group's thread for the season, on a tab of its own. Rendered
 * once here from the same read `GET /api/chat` answers, then kept fresh by the
 * screen's own polling. Opening it is reading it, so the marker behind the
 * tab's badge moves here too.
 *
 * `data-own-scroll` holds the page to the viewport (globals.css): the thread
 * scrolls inside its own box, so the composer stays above the bottom nav.
 */
export default async function Chat() {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const group = choice.current;
  const now = new Date();
  const [thread, board] = await Promise.all([chatThread(db(), member, group.id), groupBoard(db(), group.id)]);
  await markRead(db(), member.id, group.id, thread);
  const members = board.filter((entry) => entry.active).length;

  return (
    <main data-own-scroll className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
      <div className="border-b border-border">
        <AppHeader
          title="Chat"
          sub={`${group.name} · ${plural(members, "member")}`}
          right={<MemberMenu member={member} group={<GroupSwitcher choice={choice} />} manage={await currentManageHref()} />}
        />
      </div>
      {/* Keyed on the Group, so switching boards starts the thread, its poll and its draft afresh. */}
      <ChatThread key={group.id} initial={toChatStateJson(thread, now)} viewer={toMemberJson(member)} groupId={group.id} groupName={group.name} />
    </main>
  );
}
