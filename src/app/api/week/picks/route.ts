import { pickRoute } from "../context";
import { getSheet, putPick } from "../handlers";

export const GET = () => getSheet(pickRoute());

export const PUT = (request: Request) => putPick(request, pickRoute());
