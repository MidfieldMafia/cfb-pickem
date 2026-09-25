import { pickRoute } from "../../../context";
import { getGamePlays } from "../../../handlers";

export async function GET(request: Request, ctx: RouteContext<"/api/week/games/[gameId]/plays">) {
  const { gameId } = await ctx.params;
  return getGamePlays(request, pickRoute(), gameId);
}
