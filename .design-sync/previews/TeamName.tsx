import { TeamName } from "@saturday-slate/design-system";

const stack = { display: "grid", gap: 8, padding: 16 } as const;

export function Ranked() {
  return (
    <div style={stack}>
      <TeamName name="Georgia" rank={2} className="text-lg" />
      <TeamName name="Ohio State" rank={1} className="text-lg" />
    </div>
  );
}

export function Unranked() {
  return (
    <div style={stack}>
      <TeamName name="Kansas State" rank={null} className="text-lg" />
      <TeamName name="Iowa State" rank={null} className="text-lg" />
    </div>
  );
}

export function BesideAScore() {
  return (
    <div style={{ ...stack, gridAutoFlow: "column", justifyContent: "start", gap: 24, alignItems: "center" }}>
      <TeamName name="Georgia" rank={2} className="text-lg" />
      <span className="font-display font-black text-[28px] leading-8 tabular-nums">31–24</span>
      <TeamName name="Alabama" rank={4} className="text-lg" />
    </div>
  );
}
