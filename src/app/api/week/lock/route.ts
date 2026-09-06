import { pickRoute } from "../context";
import { putLock } from "../handlers";

export const PUT = (request: Request) => putLock(request, pickRoute());
