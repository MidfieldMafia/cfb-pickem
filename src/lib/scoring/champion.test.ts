import { describe, expect, it } from "vitest";
import { regularSeasonChampions, scoreSeason } from "./index";
import { finalGame, rules2026, week } from "./fixtures/build";
import type { Game, Member, Pick, Week } from "./types";

const JOINED = "2026-08-01T00:00:00Z";
const members: Member[] = ["dee", "sam", "kim"].map((id) => ({ id, joinedAt: JOINED }));
const everyoneActive = members.map((m) => ({ ...m, active: true }));

/** One game a Week, home team winning: each member named in `right` picks it, the rest pick the loser. */
function oneGameWeek(weekNumber: number, right: string[], game?: Partial<Game>): Week {
  const id = `w${weekNumber}`;
  const picks: Pick[] = members.map((m) => ({ memberId: m.id, gameId: id, team: right.includes(m.id) ? "Home" : "Away" }));
  return week({
    weekNumber,
    deadline: `2026-11-${String(weekNumber).padStart(2, "0")}T16:00:00Z`,
    games: [{ ...finalGame(id, "Home", "Away", 21, 14), ...game }],
    picks,
  });
}

function champions(weeks: Week[], candidates = everyoneActive) {
  return regularSeasonChampions(scoreSeason(rules2026, weeks, members), candidates).map((row) => row.memberId);
}

describe("regularSeasonChampions", () => {
  it("names nobody before Week 13 is played", () => {
    expect(champions([oneGameWeek(11, ["dee"]), oneGameWeek(12, ["dee"])])).toEqual([]);
  });

  it("names nobody while a Week 13 game is still pending", () => {
    const pending = oneGameWeek(13, ["dee"], { status: "in_progress" });
    expect(champions([oneGameWeek(12, ["dee"]), pending])).toEqual([]);
  });

  it("names the member first once Week 13 is settled, with their points through Week 13", () => {
    const result = regularSeasonChampions(
      scoreSeason(rules2026, [oneGameWeek(12, ["dee", "sam"]), oneGameWeek(13, ["dee"])], members),
      everyoneActive,
    );
    expect(result.map((r) => [r.memberId, r.totalPoints])).toEqual([["dee", 20]]);
  });

  it("treats a Void game as settled", () => {
    expect(champions([oneGameWeek(12, ["sam"]), oneGameWeek(13, [], { void: true, status: "scheduled" })])).toEqual([
      "sam",
    ]);
  });

  it("passes over a leader who has left the group for the top member still in it", () => {
    const deeLeft = everyoneActive.map((m) => (m.id === "dee" ? { ...m, active: false } : m));
    const weeks = [oneGameWeek(12, ["dee", "sam"]), oneGameWeek(13, ["dee"])];
    expect(champions(weeks, deeLeft)).toEqual(["sam"]);
  });

  it("crowns co-champions when the top members tie on every tiebreak", () => {
    expect(champions([oneGameWeek(12, ["dee", "sam"]), oneGameWeek(13, ["dee", "sam"])]).sort()).toEqual(["dee", "sam"]);
  });

  it("breaks a tie on points by the season tiebreak", () => {
    // Level on 10 points, but Dee's Guess was closer, so Dee took Week 13 and holds the Weekly Win.
    const final = {
      ...oneGameWeek(13, ["dee", "sam"]),
      tiebreakerGameId: "w13",
      tiebreakerGuesses: [
        { memberId: "dee", guess: 35 },
        { memberId: "sam", guess: 50 },
      ],
    };
    expect(champions([oneGameWeek(12, []), final])).toEqual(["dee"]);
  });

  it("is decided on Week 13's board, whatever later Weeks add", () => {
    // Sam passes Dee over Weeks 14 and 15, after the title was decided.
    const weeks = [oneGameWeek(12, ["dee", "sam"]), oneGameWeek(13, ["dee"]), oneGameWeek(14, ["sam"]), oneGameWeek(15, ["sam"])];
    expect(champions(weeks)).toEqual(["dee"]);
  });
});
