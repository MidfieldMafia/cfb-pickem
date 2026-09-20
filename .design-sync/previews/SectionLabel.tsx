import { Card, SectionLabel, TeamName } from "@saturday-slate/design-system";

const phone = { maxWidth: 390 } as const;

export function KickoffWindows() {
  return (
    <div style={phone}>
      <SectionLabel>Noon</SectionLabel>
      <div style={{ padding: "0 16px", display: "grid", gap: 12 }}>
        <Card><TeamName name="Ohio State" rank={1} className="text-lg" /></Card>
      </div>
      <SectionLabel>3:30</SectionLabel>
      <div style={{ padding: "0 16px", display: "grid", gap: 12 }}>
        <Card><TeamName name="Georgia" rank={2} className="text-lg" /></Card>
      </div>
      <SectionLabel>Night</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <Card><TeamName name="Oregon" rank={5} className="text-lg" /></Card>
      </div>
    </div>
  );
}

export function EmptyStateHeading() {
  return (
    <div style={phone}>
      <div style={{ padding: 16 }}>
        <Card>
          <SectionLabel className="px-0 pt-0">No slate posted</SectionLabel>
          <p className="text-sm text-muted-foreground" style={{ margin: 0 }}>
            The Commissioners post the Week 5 slate by Wednesday.
          </p>
        </Card>
      </div>
    </div>
  );
}
