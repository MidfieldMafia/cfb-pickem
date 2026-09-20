import { logoSrc } from "@/lib/logos";
import { TeamLogo as DSTeamLogo } from "@saturday-slate/design-system";

/** A school mark at a fixed size. Resolves the school name to a src and forwards to the design system's presentational `TeamLogo`. */
export function TeamLogo({ team, size, className }: { team: string; size?: number; className?: string }) {
  return <DSTeamLogo src={logoSrc(team)} size={size} className={className} />;
}
