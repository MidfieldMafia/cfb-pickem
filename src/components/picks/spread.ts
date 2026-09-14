/**
 * The spread arrives from the feed as one string naming the favorite — "Georgia
 * −6.5" — but the matchup panel shows a number over each team. Splitting it is
 * the only real logic on that row, so it sits here where a test can reach it
 * rather than inside the component.
 */

/** Splits "Georgia −6.5" into what the away side and the home side of the spread row show. */
export function spreadSides(spread: string, away: string): [string, string] {
  if (spread === "Pick" || spread === "PK") return ["PK", "PK"];
  const favorite = spread.replace(/\s[−+-].*$/, "");
  const line = spread.slice(favorite.length).trim();
  const underdog = `+${line.replace(/^[−-]/, "")}`;
  return favorite === away ? [line, underdog] : [underdog, line];
}
