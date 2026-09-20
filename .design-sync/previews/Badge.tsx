import { Badge } from "@saturday-slate/design-system";

const row = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: 16 } as const;

export function GameStates() {
  return (
    <div style={row}>
      <Badge variant="win">Win</Badge>
      <Badge variant="loss">Loss</Badge>
      <Badge variant="live">Live</Badge>
      <Badge variant="locked">Locked</Badge>
      <Badge variant="pending">Pending</Badge>
      <Badge variant="void">Void</Badge>
      <Badge variant="leader">Leader</Badge>
    </div>
  );
}

export function GenericVariants() {
  return (
    <div style={row}>
      <Badge>Week 4</Badge>
      <Badge variant="secondary">Lock of the Week</Badge>
      <Badge variant="destructive">Deadline passed</Badge>
      <Badge variant="outline">Trailing</Badge>
      <Badge variant="ghost">3 picks</Badge>
      <Badge variant="link">Details</Badge>
    </div>
  );
}
