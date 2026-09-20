import { MemberChip } from "@saturday-slate/design-system";
import p04 from "../../public/avatars/pennants/04.svg";
import p14 from "../../public/avatars/pennants/14.svg";

const row = { display: "flex", gap: 24, alignItems: "center", padding: 16, flexWrap: "wrap" } as const;

export function WithPennant() {
  return (
    <div style={row}>
      <MemberChip avatar={{ name: "Moss Dot", file: p04, color: "#6A9449" }} displayName="Jonah" />
      <MemberChip avatar={{ name: "Copper Tip", file: p14, color: "#D2712E" }} displayName="Kim" />
    </div>
  );
}

export function NoPennantYet() {
  return (
    <div style={row}>
      <MemberChip avatar={undefined} displayName="Alex" />
    </div>
  );
}
