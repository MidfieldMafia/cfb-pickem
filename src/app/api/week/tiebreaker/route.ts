import { pickRoute } from "../context";
import { putTiebreaker } from "../handlers";

export const PUT = (request: Request) => putTiebreaker(request, pickRoute());
