import { Pennant, PennantGroup } from "@saturday-slate/design-system";
import p04 from "../../public/avatars/pennants/04.svg";
import p05 from "../../public/avatars/pennants/05.svg";
import p06 from "../../public/avatars/pennants/06.svg";
import p13 from "../../public/avatars/pennants/13.svg";
import p14 from "../../public/avatars/pennants/14.svg";

const moss = { name: "Moss Dot", file: p04, color: "#6A9449" };
const row = { display: "flex", alignItems: "center", gap: 16, padding: 16, flexWrap: "wrap" } as const;

export function Sizes() {
  return (
    <div style={row}>
      <Pennant avatar={moss} name="Jonah" size={72} />
      <Pennant avatar={moss} name="Jonah" size={44} />
      <Pennant avatar={moss} name="Jonah" size={28} />
      <Pennant avatar={moss} name="Jonah" size={20} />
    </div>
  );
}

export function NoPennantYet() {
  return (
    <div style={row}>
      <Pennant avatar={undefined} name="Alex" size={72} />
      <Pennant avatar={undefined} name="Sam" size={44} />
      <Pennant avatar={undefined} name="Lee" size={28} />
    </div>
  );
}

export function Group() {
  const members = [
    { id: 1, displayName: "Jonah", avatar: moss },
    { id: 2, displayName: "Alex", avatar: { name: "Oxblood Bars", file: p05, color: "#5E1F1A" } },
    { id: 3, displayName: "Sam", avatar: { name: "Maroon Chevrons", file: p06, color: "#75222C" } },
    { id: 4, displayName: "Lee", avatar: { name: "Sage Twin Bands", file: p13, color: "#5C9A74" } },
    { id: 5, displayName: "Kim", avatar: { name: "Copper Tip", file: p14, color: "#D2712E" } },
    { id: 6, displayName: "Robin", avatar: undefined },
    { id: 7, displayName: "Pat", avatar: undefined },
  ];
  return (
    <div style={row}>
      <PennantGroup members={members} viewerId={3} size={28} />
    </div>
  );
}
