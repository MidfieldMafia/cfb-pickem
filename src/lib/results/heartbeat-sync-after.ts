/**
 * The console's heartbeat sync (#546): a slate edit's re-sync runs in Next's
 * `after()`, once the commissioner's response has gone, so a QStash problem
 * never fails or slows the edit. Kept apart from `heartbeat-sync.ts` so the
 * suites that run the sync never load `next/server`.
 */
import "server-only";
import { after } from "next/server";
import type { Db } from "@/db/types";
import { syncHeartbeat } from "./heartbeat-sync";

export function syncHeartbeatAfter(db: Db): void {
  after(async () => {
    await syncHeartbeat(db);
  });
}
