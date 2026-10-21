/**
 * The Game sheet field's turf and chalk: the resolution of "Signature fields"
 * (#397, built in #436). Four schools paint their own field when they are the
 * home team and the game is not at a neutral site; every other game keeps pine.
 *
 * Pure and client-safe. Keyed by school as `logos.ts` names it.
 */
import { CREAM } from "./end-zones";

export interface FieldStyle {
  turf: string;
  /** Chalk opacities: yard numbers, 10-yard lines, 5-yard lines. */
  numbers: number;
  tens: number;
  fives: number;
  /** Yard numbers every this many yards, drawn at `numberSize`. */
  numberStep: 5 | 10;
  numberSize: number;
  /** Replaces the home school's end zone colours. */
  homeZone?: { fill: string; ink: string };
}

export const PINE_FIELD: FieldStyle = { turf: "#1F4034", numbers: 0.7, tens: 0.45, fives: 0.2, numberStep: 10, numberSize: 10 };

const SIGNATURE: Record<string, FieldStyle> = {
  "Boise State": { ...PINE_FIELD, turf: "#2150A6", numbers: 0.95, tens: 0.6, fives: 0.3 },
  "Coastal Carolina": {
    ...PINE_FIELD,
    turf: "#0F5F62",
    numbers: 0.95,
    tens: 0.6,
    fives: 0.3,
    homeZone: { fill: "#16120F", ink: CREAM },
  },
  "Eastern Michigan": { ...PINE_FIELD, turf: "#4B5255", numbers: 0.9, tens: 0.55, fives: 0.25 },
  LSU: { ...PINE_FIELD, numberStep: 5, numberSize: 8 },
};

/** The field for a game. `neutralSite` is absent from snapshots taken before it was stored, and reads as false. */
export function fieldFor(homeTeam: string, neutralSite: boolean | undefined): FieldStyle {
  return neutralSite === true ? PINE_FIELD : (SIGNATURE[homeTeam] ?? PINE_FIELD);
}

/** The yard lines that carry a number, with what they say: 5, 10 … 50 … 10, 5. `yard` is the distance from the left goal line. */
export function numberedYards(step: 5 | 10): { yard: number; label: number }[] {
  const yards = Array.from({ length: 19 }, (_, i) => (i + 1) * 5).filter((yard) => yard % step === 0);
  return yards.map((yard) => ({ yard, label: yard <= 50 ? yard : 100 - yard }));
}
