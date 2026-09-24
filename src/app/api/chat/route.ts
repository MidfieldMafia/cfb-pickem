import { getChat, postChat } from "@/lib/chat/http";
import { chatRoute } from "./context";

export const GET = (request: Request) => getChat(request, chatRoute());
export const POST = (request: Request) => postChat(request, chatRoute());
