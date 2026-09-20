import {
  Badge, Pennant, Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@saturday-slate/design-system";
import p04 from "../../public/avatars/pennants/04.svg";
import p05 from "../../public/avatars/pennants/05.svg";
import p13 from "../../public/avatars/pennants/13.svg";

const rows = [
  { rank: 1, name: "Jonah", pts: 62, wins: 2, avatar: { name: "Moss Dot", file: p04, color: "#6A9449" } },
  { rank: 2, name: "Alex", pts: 60, wins: 1, avatar: { name: "Oxblood Bars", file: p05, color: "#5E1F1A" } },
  { rank: 3, name: "Sam", pts: 57, wins: 1, avatar: { name: "Sage Twin Bands", file: p13, color: "#5C9A74" } },
  { rank: 4, name: "Lee", pts: 51, wins: 0, avatar: undefined },
];
const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

export function Leaderboard() {
  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Member</TableHead>
            <TableHead style={num}>Points</TableHead>
            <TableHead style={num}>Wins</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.rank}>
              <TableCell className="tabular-nums">{r.rank}</TableCell>
              <TableCell>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Pennant avatar={r.avatar} name={r.name} size={28} />
                  {r.name}
                  {r.rank === 1 ? <Badge variant="leader">Leader</Badge> : null}
                </span>
              </TableCell>
              <TableCell style={num}>{r.pts}</TableCell>
              <TableCell style={num}>{r.wins}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Group total</TableCell>
            <TableCell style={num}>230</TableCell>
            <TableCell style={num}>4</TableCell>
          </TableRow>
        </TableFooter>
        <TableCaption>Season leaderboard · Week 4</TableCaption>
      </Table>
    </div>
  );
}
