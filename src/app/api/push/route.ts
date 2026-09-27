import { db } from "@/db";
import { currentMember } from "@/lib/members/current";
import { deletePush, getPush, patchPush, postPush, type PushRoute } from "@/lib/push/http";
import { pushConfigFromEnv } from "@/lib/push/sender";

function pushRoute(): PushRoute {
  return { db: db(), currentMember, config: pushConfigFromEnv() };
}

export const GET = () => getPush(pushRoute());
export const POST = (request: Request) => postPush(request, pushRoute());
export const PATCH = (request: Request) => patchPush(request, pushRoute());
export const DELETE = (request: Request) => deletePush(request, pushRoute());
