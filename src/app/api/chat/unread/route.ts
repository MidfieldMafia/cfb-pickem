import { getChatUnread } from "@/lib/chat/http";
import { chatRoute } from "../context";

export const GET = () => getChatUnread(chatRoute());
