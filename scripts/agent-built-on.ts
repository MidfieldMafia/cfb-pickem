/**
 * Rewrites an agent:go PR's `Built on:` line to the whole format
 * (`.claude/skills/agent-go/SKILL.md`, step 7) from the saved route and the
 * build's totals. The line's rules are in `src/lib/agent-go/built-on.ts`.
 *
 *   npm run -s agent-built-on -- <issue> <pr> --tokens <N> --tools <M> [--legs "<legs>"]
 *
 * `--tokens` and `--tools` are the sums of every leg's `subagent_tokens` and
 * `tool_uses`. Reads `/tmp/agent-go-route-<issue>.json`; edits only the PR's
 * `Built on:` line, through `gh api`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { builtOnLine, replaceBuiltOn } from "../src/lib/agent-go/built-on";
import type { Route } from "../src/lib/agent-go/route";

const REPO = "MidfieldMafia/cfb-pickem";
const USAGE = 'Usage: npm run -s agent-built-on -- <issue> <pr> --tokens <N> --tools <M> [--legs "<legs>"]';

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { tokens: { type: "string" }, tools: { type: "string" }, legs: { type: "string" } },
  });
  const [issue, pr] = positionals.map(Number);
  const tokens = Number(values.tokens);
  const tools = Number(values.tools);
  if (![issue, pr, tokens, tools].every((n) => Number.isInteger(n) && n >= 0) || !issue || !pr) throw new Error(USAGE);

  const route = JSON.parse(readFileSync(`/tmp/agent-go-route-${issue}.json`, "utf8")) as Route;
  const body = JSON.parse(execFileSync("gh", ["api", `repos/${REPO}/pulls/${pr}`], { encoding: "utf8" })).body as string;
  const line = builtOnLine({ existing: body, route, tokens, tools, legs: values.legs });
  execFileSync("gh", ["api", "-X", "PATCH", `repos/${REPO}/pulls/${pr}`, "--input", "-"], {
    input: JSON.stringify({ body: replaceBuiltOn(body, line) }),
    stdio: ["pipe", "ignore", "inherit"],
  });
  console.log(line);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
