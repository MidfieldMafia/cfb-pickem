import {
  Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
  TeamLogo, TeamName,
} from "@saturday-slate/design-system";
import georgia from "../../public/logos/georgia.png";
import alabama from "../../public/logos/alabama.png";

const wrap = { padding: 16, maxWidth: 390, display: "grid", gap: 12 } as const;
const teamRow = { display: "flex", alignItems: "center", gap: 8, minHeight: 56 } as const;

export function GameCard() {
  return (
    <div style={wrap}>
      <Card>
        <CardHeader>
          <CardTitle>Georgia at Alabama</CardTitle>
          <CardDescription>Sat, 3:30 PM · Bryant-Denny Stadium</CardDescription>
          <CardAction><Badge variant="locked">Locked</Badge></CardAction>
        </CardHeader>
        <CardContent>
          <div style={teamRow}><TeamLogo src={georgia} size={28} /><TeamName name="Georgia" rank={2} className="text-lg" /></div>
          <div style={teamRow}><TeamLogo src={alabama} size={28} /><TeamName name="Alabama" rank={4} className="text-lg" /></div>
        </CardContent>
        <CardFooter>
          <Button size="sm" variant="outline">Change pick</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export function RankSummary() {
  return (
    <div style={wrap}>
      <Card>
        <CardHeader>
          <CardDescription>You · Season</CardDescription>
          <CardTitle className="font-display text-2xl">3rd of 8</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground m-0">62 points through Week 4 · 2 Weekly Wins</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function ConsolePanel() {
  return (
    <div style={wrap}>
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle asChild><h2 className="font-display text-lg m-0">Week 5 slate</h2></CardTitle>
          <CardDescription>10 games · picks lock Sat 12:00 PM</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
