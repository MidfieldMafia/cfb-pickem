/**
 * The spread arrives from the feed as one string naming the favorite — "Georgia
 * −6.5" — but the matchup panel shows a number over each team. Splitting it is
 * the only real logic on that row, so it sits here where a test can reach it
 * rather than inside the component.
 */

/** True for the side of a `spreadSides` pair that carries the line, the favorite's. */
export function isFavoredLine(line: string): boolean {
  return line.startsWith("−") || line.startsWith("-");
}

/** "Georgia -6.5" as the feed may write it, with a true minus sign; "Pick" stays "Pick". */
export function spreadHeadline(spread: string): string {
  return spread === "PK" ? "Pick" : spread.replace(/-(?=\d)/, "−");
}

/** Splits "Georgia −6.5" into what the away side and the home side of the spread row show. */
export function spreadSides(spread: string, away: string): [string, string] {
  if (spread === "Pick" || spread === "PK") return ["PK", "PK"];
  const favorite = spread.replace(/\s[−+-].*$/, "");
  const line = spread.slice(favorite.length).trim();
  const underdog = `+${line.replace(/^[−-]/, "")}`;
  return favorite === away ? [line, underdog] : [underdog, line];
}
