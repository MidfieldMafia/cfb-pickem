import { cn } from "cn";

/** A team on a slate row: the display name, with its AP rank in front when it has one. */
export function TeamName({
  name,
  rank,
  className,
}: {
  name: string;
  rank: number | null;
  className?: string;
}) {
  return (
    <span className={cn("font-display font-black", className)}>
      {rank ? <span className="mr-1 text-xs font-bold text-muted-foreground">#{rank}</span> : null}
      {name}
    </span>
  );
}
