/**
 * Creates the four Upstash QStash schedules that ping `/api/cron/live` once a
 * minute in game windows (see `docs/agents/heartbeat.md`). Idempotent: it lists
 * the schedules already there and replaces one with the same destination and
 * cron in place, so running it twice still leaves four. A schedule on the same
 * destination with a cron not listed here (an old window) is deleted.
 *
 *   npx tsx --env-file=.env.qstash scripts/qstash-schedules.mts
 *
 * Reads `QSTASH_TOKEN`, the production `CRON_SECRET`, and optionally
 * `QSTASH_URL` (the Marketplace sets it; defaults to the global endpoint) and
 * `HEARTBEAT_BASE_URL` (defaults to production). It prints what it did and
 * never prints the secret. Plain `fetch` against the REST API: no SDK.
 */

/** UTC windows covering every Eastern kickoff on both sides of DST. The busiest day is 840 pings, past the Marketplace Free plan's 500, so QStash is on Pay as You Go. */
const WINDOWS = [
  { id: "slate-live-saturday-day", cron: "* 15-23 * * 6" },
  { id: "slate-live-saturday-night", cron: "* 0-8 * * 0" },
  { id: "slate-live-weeknight-evening", cron: "* 23 * * 2-5" },
  { id: "slate-live-weeknight-late", cron: "* 0-4 * * 3-6" },
] as const;

interface Schedule {
  scheduleId: string;
  cron: string;
  destination: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
}

const token = required("QSTASH_TOKEN");
const secret = required("CRON_SECRET");
const qstash = (process.env.QSTASH_URL?.trim() || "https://qstash.upstash.io").replace(/\/+$/, "");
const base = (process.env.HEARTBEAT_BASE_URL?.trim() || "https://slate.midfield-mafia.com").replace(/\/+$/, "");
const destination = `${base}/api/cron/live`;

async function call(method: string, path: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(`${qstash}/v2/schedules${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
  const text = await response.text();
  if (!response.ok) {
    const shown = path.startsWith("/http") ? "/<destination>" : path;
    throw new Error(`${method} /v2/schedules${shown}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const existing = ((await call("GET", "")) as Schedule[]).filter((s) => s.destination === destination);
const kept = new Set<string>();

for (const window of WINDOWS) {
  const match = existing.find((s) => s.cron === window.cron && !kept.has(s.scheduleId));
  const scheduleId = match?.scheduleId ?? window.id;
  await call("POST", `/${destination}`, {
    "Upstash-Schedule-Id": scheduleId,
    "Upstash-Cron": window.cron,
    "Upstash-Retries": "0",
    "Upstash-Forward-Authorization": `Bearer ${secret}`,
  });
  kept.add(scheduleId);
  console.log(`${match ? "replaced" : "created "} ${scheduleId}  ${window.cron}`);
}

for (const stale of existing.filter((s) => !kept.has(s.scheduleId))) {
  await call("DELETE", `/${stale.scheduleId}`);
  console.log(`deleted  ${stale.scheduleId}  ${stale.cron}`);
}

console.log(`${WINDOWS.length} schedules ping ${destination}.`);
