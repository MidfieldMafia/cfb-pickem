/**
 * Picks the model and effort an agent:go build runs on (#463): builds Jev's
 * state from the issue, asks Jev the difficulty question in
 * `.claude/skills/agent-go/SKILL.md`, and maps the answer to a tier with that
 * skill's table. The rules are in `src/lib/agent-go/route.ts`.
 *
 *   npm run -s agent-route -- <issue>              # route a claimed ticket
 *   npm run -s agent-route -- <issue> --escalate   # one level up, after a failed build
 *
 * Prints the route as one JSON line and saves it to
 * `/tmp/agent-go-route-<issue>.json`, where `--escalate` reads it. It never
 * fails the run over Jev: a 401, a network error, another non-200 or an answer
 * it cannot read all route to the routine's default, with the error in the JSON.
 * A 429, a 529 or a network error is first retried with backoff. The JSON also
 * carries Jev's five probabilities, its model, the status and the elapsed time,
 * which the `Built on:` line prints (#516).
 *
 * The key: in the cloud, the TypeSafe network secret adds it on the way out;
 * anywhere else, `TYPESAFE_API_KEY` in the environment.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  escalate,
  jevRequest,
  jevState,
  readSkill,
  route,
  routeOnError,
  sendWithRetry,
  type JevState,
  type Route,
} from "../src/lib/agent-go/route";

const REPO = "MidfieldMafia/cfb-pickem";
const SKILL = ".claude/skills/agent-go/SKILL.md";
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_TIMEOUT_MS = 60_000;

function gh(path: string): unknown {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

/** The issue's parent map by title; an issue that is no sub-issue answers 404. */
function parentTitle(issue: number): string | null {
  try {
    const parent = gh(`repos/${REPO}/issues/${issue}/parent`) as { title?: string };
    return parent.title ?? null;
  } catch {
    return null;
  }
}

/** Every comment body, a page of 100 at a time: a brief can come late in a long thread. */
function comments(issue: number): string[] {
  const bodies: string[] = [];
  for (let page = 1; ; page++) {
    const batch = gh(`repos/${REPO}/issues/${issue}/comments?per_page=100&page=${page}`) as { body: string | null }[];
    bodies.push(...batch.map((c) => c.body ?? ""));
    if (batch.length < 100) return bodies;
  }
}

function lineCount(file: string): number | null {
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return readFileSync(file, "utf8").split("\n").length;
}

async function askJev(issue: number): Promise<Route> {
  const { question, levels, tiers } = readSkill(readFileSync(SKILL, "utf8"));
  // In the cloud the key is a network secret: the proxy adds it, and it is
  // never in the VM. Only a run elsewhere sends its own, from the environment.
  const key = process.env.TYPESAFE_API_KEY;
  const auth: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};

  let state: JevState;
  try {
    const raw = gh(`repos/${REPO}/issues/${issue}`) as { title: string; body: string | null; labels: { name: string }[] };
    state = jevState({
      issue: { title: raw.title, body: raw.body ?? "", labels: raw.labels.map((l) => l.name) },
      comments: comments(issue),
      parentMap: parentTitle(issue),
      lineCount,
    });
  } catch (error) {
    // Not Jev's fault, so the issue comment must not say it was.
    return routeOnError(`could not read the issue: ${error instanceof Error ? error.message : String(error)}`, tiers);
  }

  const body = JSON.stringify(jevRequest(state, question, levels));
  const sent = await sendWithRetry(() =>
    fetch(JEV_URL, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    }),
  );
  if ("thrown" in sent) {
    const { thrown, call } = sent;
    return routeOnError(thrown instanceof Error ? thrown.message : String(thrown), tiers, call);
  }
  const { reply: response, call } = sent;
  // Jev answers a request with no key 403, and a bad one 401.
  if ((response.status === 401 || response.status === 403) && !key) {
    return routeOnError(
      `HTTP ${response.status} from Jev: no key reached it (the TypeSafe network secret, or TYPESAFE_API_KEY off the cloud)`,
      tiers,
      call,
    );
  }
  if (!response.ok) return routeOnError(`HTTP ${response.status} from Jev`, tiers, call);
  return route(await response.json().catch(() => null), tiers, call);
}

async function main() {
  const [arg, flag] = process.argv.slice(2);
  const issue = Number(arg);
  if (!Number.isInteger(issue) || issue <= 0 || (flag && flag !== "--escalate")) {
    throw new Error("Usage: npm run -s agent-route -- <issue> [--escalate]");
  }
  const saved = `/tmp/agent-go-route-${issue}.json`;

  if (flag === "--escalate") {
    if (!existsSync(saved)) throw new Error(`${saved} is missing: route the ticket first.`);
    const { tiers } = readSkill(readFileSync(SKILL, "utf8"));
    const next = escalate(JSON.parse(readFileSync(saved, "utf8")) as Route, tiers);
    if (!next) {
      console.log("no escalation: level 5");
      return;
    }
    writeFileSync(saved, JSON.stringify(next));
    console.log(JSON.stringify(next));
    return;
  }

  const chosen = await askJev(issue);
  writeFileSync(saved, JSON.stringify(chosen));
  console.log(JSON.stringify(chosen));
}

// Node's own fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY was set when
// it started, and the cloud reaches the internet only through that proxy.
// Each command runs in a fresh shell, so rerun this same process with it.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(child.status ?? 1);
} else {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
