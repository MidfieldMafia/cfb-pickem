import { TeamLogo } from "@saturday-slate/design-system";
import ohioState from "../../public/logos/ohio-state.png";
import texas from "../../public/logos/texas.png";
import lsu from "../../public/logos/lsu.png";
import michigan from "../../public/logos/michigan.png";

const row = { display: "flex", alignItems: "center", gap: 16, padding: 16, flexWrap: "wrap" } as const;

export function Sizes() {
  return (
    <div style={row}>
      <TeamLogo src={ohioState} size={56} />
      <TeamLogo src={ohioState} size={28} />
      <TeamLogo src={ohioState} size={18} />
    </div>
  );
}

export function Schools() {
  return (
    <div style={row}>
      <TeamLogo src={texas} size={56} />
      <TeamLogo src={lsu} size={56} />
      <TeamLogo src={michigan} size={56} />
    </div>
  );
}

export function Dimmed() {
  return (
    <div style={row}>
      <TeamLogo src={ohioState} size={56} />
      <TeamLogo src={michigan} size={56} className="opacity-50" />
    </div>
  );
}

export function NoLogo() {
  return (
    <div style={row}>
      <TeamLogo src={undefined} size={28} />
      <span style={{ fontSize: 14 }}>A school without a logo keeps its space</span>
    </div>
  );
}
