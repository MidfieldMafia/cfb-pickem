import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

/**
 * Route drift. Three lists name the app's URLs besides the app itself: the
 * proxy's matcher, which signs out a visitor without a cookie, and the skills
 * that tell an agent which screen to read. When a route moves, nothing else
 * notices: the matcher kept `/week` for weeks after it went, and an agent sent
 * there reads a 404 as its finding.
 */

/** Every page and route handler under src/app, as URL patterns with route groups dropped. */
function appRoutes(dir = "src/app", url = ""): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = /^\(.*\)$/.test(name) ? "" : `/${name}`;
      found.push(...appRoutes(full, url + segment));
    } else if (/^(page|route)\.tsx?$/.test(name)) {
      found.push(url || "/");
    }
  }
  return found;
}

const routes = appRoutes();
const pages = (prefix: string) =>
  appRoutes(prefix).map((route) => {
    const url = prefix.replace("src/app", "").replace(/\/\(.*?\)/g, "");
    return (url + (route === "/" ? "" : route)) || "/";
  });

/** Whether a concrete path is served by some route, `[param]` segments matching anything. */
function served(urlPath: string): boolean {
  const want = urlPath.split("/").filter(Boolean);
  return routes.some((route) => {
    const have = route.split("/").filter(Boolean);
    return have.length === want.length && have.every((seg, i) => /^\[.*\]$/.test(seg) || seg === want[i]);
  });
}

/** The proxy's own matching: "/a/:path*" takes /a and everything under it, anything else only itself. */
function gated(urlPath: string): boolean {
  return config.matcher.some((entry) => {
    const base = entry.replace(/\/:path\*$/, "");
    return entry.endsWith("/:path*") ? urlPath === base || urlPath.startsWith(`${base}/`) : urlPath === entry;
  });
}

describe("proxy matcher", () => {
  it.each(config.matcher)("%s names a route that exists", (entry) => {
    const base = entry.replace(/\/:path\*$/, "");
    expect(routes.some((route) => route === base || route.startsWith(`${base}/`))).toBe(true);
  });

  it.each([...pages("src/app/(member)"), ...pages("src/app/console")])("gates %s", (page) => {
    expect(gated(page)).toBe(true);
  });
});

function skillFiles(dir = ".claude/skills"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? skillFiles(full) : name.endsWith(".md") ? [full] : [];
  });
}

/** `${BASE}/picks` and `$BASE/picks`, as the skills write a URL on the dev server. */
const linked = skillFiles().flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/\$\{?BASE\}?(\/[a-z0-9/_[\]<>-]*)/gi)].map(
    (match) => [file, match[1].replace(/\/$/, "") || "/"] as const,
  ),
);

describe("skills", () => {
  // `$BASE/<route>` stands for any screen at all and names none.
  const concrete = linked.filter(([, url]) => !/^(\/<[^/]*>)+$/.test(url));
  it.each(concrete)("%s links %s, a route that exists", (_file, url) => {
    // A placeholder segment, `/m/<token>`, stands for anything: match it like a [param].
    expect(served(url.replace(/<[^/]*>/g, "x"))).toBe(true);
  });
});
