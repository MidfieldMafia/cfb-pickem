import { db } from "@/db";
import { GroupSwitcher } from "@/components/group-switcher";
import { NoGroup } from "@/components/no-group";
import { cfbd } from "@/lib/cfbd";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { closeGamesAfter } from "@/lib/push/close-game-after";
import { toMemberJson } from "@/lib/slate/json";
import { toWeekStateJson } from "@/lib/week/json";
import { scoredWeek } from "@/lib/week/week";
import { NoSlate } from "../picks/no-slate";
import { LiveBoard } from "./live-board";

/**
 * The Live Board: the Saturday view of the Slate with live scores and, once
 * the Deadline has passed, every member's pick on each side coloured by
 * whether that side is winning. Rendered once here from the same read the
 * state endpoint answers, then kept fresh by the screen's own polling.
 * `?game=<id>` opens that game's sheet, which is where a Close game push
 * lands (#531); an id not on the Slate opens nothing.
 */
export default async function Live({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const week = await scoredWeek(db(), member, choice.current.id, new Date(), { cfbd, closeGames: closeGamesAfter });
  if (!week) return <NoSlate tour="live-screen" />;
  const { game } = await searchParams;
  return (
    <LiveBoard
      initial={toWeekStateJson(week)}
      viewer={toMemberJson(member)}
      manage={await currentManageHref()}
      switcher={<GroupSwitcher choice={choice} />}
      openGameId={typeof game === "string" ? Number(game) : null}
    />
  );
}
