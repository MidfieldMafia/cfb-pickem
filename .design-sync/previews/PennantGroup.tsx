import { PennantGroup } from "@saturday-slate/design-system";
import p04 from "../../public/avatars/pennants/04.svg";
import p05 from "../../public/avatars/pennants/05.svg";
import p13 from "../../public/avatars/pennants/13.svg";

const members = [
  { id: 1, displayName: "Jonah", avatar: { name: "Moss Dot", file: p04, color: "#6A9449" } },
  { id: 2, displayName: "Alex", avatar: { name: "Oxblood Bars", file: p05, color: "#5E1F1A" } },
  { id: 3, displayName: "Sam", avatar: { name: "Sage Twin Bands", file: p13, color: "#5C9A74" } },
  { id: 4, displayName: "Lee", avatar: undefined },
];
const row = { display: "flex", gap: 24, alignItems: "center", padding: 16, flexWrap: "wrap" } as const;

export function Roster() {
  return (
    <div style={row}>
      <PennantGroup members={members} size={28} />
      <PennantGroup members={members} size={44} />
    </div>
  );
}

export function Overflow() {
  const many = [...members, ...members.map((m) => ({ ...m, id: m.id + 10 })), ...members.map((m) => ({ ...m, id: m.id + 20 }))];
  return (
    <div style={row}>
      <PennantGroup members={many} viewerId={2} size={28} max={5} />
    </div>
  );
}
