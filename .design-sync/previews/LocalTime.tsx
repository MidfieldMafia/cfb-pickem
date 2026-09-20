import { LocalTime } from "@saturday-slate/design-system";

const stack = { display: "grid", gap: 8, padding: 16, fontSize: 14 } as const;
const kickoff = "2026-09-12T20:30:00Z";
const deadline = "2026-09-12T17:00:00Z";
const muted = { color: "var(--muted-foreground)" } as const;

export function Kickoff() {
  return (
    <div style={stack}>
      <div><span style={muted}>Kickoff · </span><LocalTime at={kickoff} style="kickoff" /></div>
    </div>
  );
}

export function Deadline() {
  return (
    <div style={stack}>
      <div><span style={muted}>Picks lock · </span><LocalTime at={deadline} style="deadline" /></div>
    </div>
  );
}

export function Slot() {
  return (
    <div style={stack}>
      <div><span style={muted}>Noon window · </span><LocalTime at={deadline} style="slot" /></div>
      <div><span style={muted}>Night window · </span><LocalTime at="2026-09-13T01:00:00Z" style="slot" /></div>
    </div>
  );
}
