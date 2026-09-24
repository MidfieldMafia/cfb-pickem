import { postChatDelete } from "@/lib/chat/http";
import { chatRoute } from "../context";

export const POST = (request: Request) => postChatDelete(request, chatRoute());
