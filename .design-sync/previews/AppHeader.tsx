import { AppHeader, MemberChip } from "@saturday-slate/design-system";
import p04 from "../../public/avatars/pennants/04.svg";

const phone = { maxWidth: 390 } as const;
const me = { name: "Moss Dot", file: p04, color: "#6A9449" };

export function TitleOnly() {
  return (
    <div style={phone}>
      <AppHeader title="Live Board" />
    </div>
  );
}

export function WithGroupAndSubtitle() {
  return (
    <div style={phone}>
      <AppHeader
        group="Mabry Family"
        title="Leaderboard"
        sub="Week 4 of 13"
        right={<MemberChip avatar={me} displayName="Jonah" href="/you" />}
      />
    </div>
  );
}

export function CommissionerHeader() {
  return (
    <div style={phone}>
      <AppHeader
        title="History"
        sub="3 settled weeks"
        manage="/console"
        right={<MemberChip avatar={undefined} displayName="Alex" href="/you" />}
      />
    </div>
  );
}
