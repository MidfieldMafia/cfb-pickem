import { pickRoute } from "../context";
import { lockEdit, putEdit } from "../handlers";

export const PUT = (request: Request) => putEdit(request, pickRoute(), lockEdit);
