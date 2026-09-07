import { pickRoute } from "../context";
import { getWeekState } from "../handlers";

export const GET = (request: Request) => getWeekState(request, pickRoute());
