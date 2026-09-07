import { pickRoute } from "../context";
import { getSheet, pickEdit, putEdit } from "../handlers";

export const GET = () => getSheet(pickRoute());

export const PUT = (request: Request) => putEdit(request, pickRoute(), pickEdit);
