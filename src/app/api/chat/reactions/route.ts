import { postChatReaction } from "@/lib/chat/http";
import { chatRoute } from "../context";

export const POST = (request: Request) => postChatReaction(request, chatRoute());
