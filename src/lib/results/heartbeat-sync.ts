/**
 * Keeps the live heartbeat's QStash schedules in step with the published Slate
 * (#546): one date-pinned schedule per UTC date a Game's window touches
 * (`heartbeat-windows.ts`), and none on any other day.
 *
 * The sync lists the schedules on `/api/cron/live`, creates or replaces the
 * wanted ones by id, and only then deletes every other schedule there — the
 * old fixed windows on the first run, and dates already past, since a
 * date-pinned cron would fire again next year. Any call that fails stops it
 * where it is, so nothing is deleted before its replacements exist.
 *
 * Plain `fetch` against the REST API, injected so a test runs it against a
 * fake; no SDK. Nothing here prints `QSTASH_TOKEN` or `CRON_SECRET`, and an
 * upstream error that echoes either has it redacted.
 *
 * Callers: the daily `refresh-slates` cron, the slate console's edits (in
 * `after()`, via `heartbeat-sync-after.ts`), and `scripts/qstash-schedules.mts`
 * by hand. See `docs/agents/heartbeat.md`.
 */
import "server-only";
import type { Game } from "@/db/schema";
import type { Db } from "@/db/types";
import { publishedSlate } from "@/lib/slate/slate";
import { heartbeatWindows } from "./heartbeat-windows";

/** The production domain: a preview's own URL is never a heartbeat target. */
export const PRODUCTION_ORIGIN = "https://slate.midfield-mafia.com";
const DEFAULT_QSTASH_URL = "https://qstash.upstash.io";

export interface HeartbeatConfig {
  token: string;
  /** The QStash REST endpoint, without a trailing slash. */
  qstashUrl: string;
  /** `CRON_SECRET`, forwarded so each ping passes `authorized()`. */
  secret: string;
  /** The full `/api/cron/live` URL the schedules ping. */
  destination: string;
}

export type SyncResult =
  | { status: "skipped"; reason: string }
  | { status: "synced"; created: string[]; replaced: string[]; deleted: string[] }
  | { status: "failed"; error: string };

export interface SyncDeps {
  fetch?: typeof fetch;
  now?: Date;
  /** Where each line of what the sync did goes; the app passes `console.info`. */
  log?: (line: string) => void;
}

interface Schedule {
  scheduleId: string;
  cron: string;
  destination: string;
}

/** The QStash settings from an environment, or why there are none: a blank value counts as unset. */
export function heartbeatConfig(
  env: Record<string, string | undefined>,
  origin: string = PRODUCTION_ORIGIN,
): HeartbeatConfig | string {
  const value = (name: string) => env[name]?.trim() || undefined;
  const token = value("QSTASH_TOKEN");
  const secret = value("CRON_SECRET");
  if (!token) return "QSTASH_TOKEN is not set";
  if (!secret) return "CRON_SECRET is not set";
  return {
    token,
    secret,
    qstashUrl: (value("QSTASH_URL") ?? DEFAULT_QSTASH_URL).replace(/\/+$/, ""),
    destination: `${origin.replace(/\/+$/, "")}/api/cron/live`,
  };
}

/**
 * The app's sync: production only, since every preview deploy and local
 * session that publishes a slate would otherwise rewrite production's
 * schedules. Reads the published Slate, the only Week `/api/cron/live`
 * refreshes. Never throws.
 */
export async function syncHeartbeat(
  db: Db,
  deps: SyncDeps & { env?: Record<string, string | undefined> } = {},
): Promise<SyncResult> {
  const env = deps.env ?? process.env;
  if (env.VERCEL_ENV !== "production") return { status: "skipped", reason: "not production" };
  const config = heartbeatConfig(env);
  if (typeof config === "string") {
    (deps.log ?? console.warn)(`Heartbeat sync skipped: ${config}.`);
    return { status: "skipped", reason: config };
  }
  try {
    const slate = await publishedSlate(db);
    return await syncSchedules(slate?.games ?? [], config, deps);
  } catch (error) {
    return failed(error, config, deps.log);
  }
}

/** Makes the schedules on `config.destination` exactly the windows `games` need. Never throws. */
export async function syncSchedules(
  games: Pick<Game, "kickoff" | "void">[],
  config: HeartbeatConfig,
  { fetch: send = fetch, now = new Date(), log }: SyncDeps = {},
): Promise<SyncResult> {
  const info = log ?? console.info;
  const call = async (method: string, path: string, headers: Record<string, string> = {}) => {
    const response = await send(`${config.qstashUrl}/v2/schedules${path}`, {
      method,
      headers: { authorization: `Bearer ${config.token}`, ...headers },
    });
    const text = await response.text();
    if (!response.ok) {
      const shown = path.startsWith("/http") ? "/<destination>" : path;
      throw new Error(`${method} /v2/schedules${shown}: ${response.status} ${text.slice(0, 300)}`);
    }
    return text ? (JSON.parse(text) as unknown) : null;
  };

  try {
    const wanted = heartbeatWindows(games, now);
    const existing = ((await call("GET", "")) as Schedule[]).filter((s) => s.destination === config.destination);
    const had = new Set(existing.map((s) => s.scheduleId));
    const created: string[] = [];
    const replaced: string[] = [];

    for (const window of wanted) {
      await call("POST", `/${config.destination}`, {
        "Upstash-Schedule-Id": window.id,
        "Upstash-Cron": window.cron,
        "Upstash-Retries": "0",
        "Upstash-Forward-Authorization": `Bearer ${config.secret}`,
      });
      (had.has(window.id) ? replaced : created).push(window.id);
      info(`Heartbeat sync: ${had.has(window.id) ? "replaced" : "created"} ${window.id} ${window.cron}`);
    }

    const keep = new Set(wanted.map((w) => w.id));
    const deleted: string[] = [];
    for (const stale of existing.filter((s) => !keep.has(s.scheduleId))) {
      await call("DELETE", `/${stale.scheduleId}`);
      deleted.push(stale.scheduleId);
      info(`Heartbeat sync: deleted ${stale.scheduleId} ${stale.cron}`);
    }

    return { status: "synced", created, replaced, deleted };
  } catch (error) {
    return failed(error, config, log);
  }
}

/** A failure's one line, with either secret cut out of whatever the upstream answered. */
function failed(error: unknown, config: HeartbeatConfig, log: (line: string) => void = console.warn): SyncResult {
  const message = error instanceof Error ? error.message : String(error);
  const safe = message.split(config.secret).join("<redacted>").split(config.token).join("<redacted>");
  log(`Heartbeat sync failed, nothing deleted after it: ${safe}`);
  return { status: "failed", error: safe };
}
