import { teamColor } from "./logos";

/**
 * Below this RGB distance the two primaries read as one block on a 6px bar,
 * so the home school falls back to its secondary. Two of the ten Week 1
 * matchups need it: Alabama against Florida State, Michigan against Notre Dame.
 */
const TOO_CLOSE = 80;

const HEX = /^#([0-9a-f]{6})$/i;

function rgb(color: string): [number, number, number] | null {
  const match = HEX.exec(color);
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16));
  return [r, g, b];
}

/** The [away, home] pair to paint a split bar with, keeping the two sides distinguishable. */
export function matchupColors(away: string, home: string): [string, string] {
  const awayColor = teamColor(away);
  const homeColor = teamColor(home);
  const a = rgb(awayColor);
  const h = rgb(homeColor);
  const tooClose = a && h && Math.hypot(a[0] - h[0], a[1] - h[1], a[2] - h[2]) < TOO_CLOSE;
  return [awayColor, tooClose ? teamColor(home, "secondary") : homeColor];
}
