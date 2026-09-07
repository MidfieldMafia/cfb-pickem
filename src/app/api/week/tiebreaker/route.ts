import { pickRoute } from "../context";
import { guessEdit, putEdit } from "../handlers";

export const PUT = (request: Request) => putEdit(request, pickRoute(), guessEdit);
