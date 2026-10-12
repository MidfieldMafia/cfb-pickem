/**
 * The Tour registry against the code it points at (#430, spec #426 "Copy
 * rules" and "Registry and targets"). Every Stop's target has to be written
 * somewhere as a `data-tour` anchor, or as the `tour:` id a component turns
 * into one, so removing an anchor fails here rather than silently dropping
 * the Stop at runtime. The copy limits are the spec's: a long Stop fails the
 * build, not the card's layout.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { tourIds } from "./ids";
import { BODY_MAX, TITLE_MAX, tours } from "./tours";

const ROOTS = ["src", "packages/design-system/src"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const code = ROOTS.flatMap(sources).map((path) => readFileSync(path, "utf8"));

/** `data-tour="x"`, `tour="x"`, `tour={"x"}` or `tour: "x"`. */
function anchored(target: string): boolean {
  const literal = new RegExp(`\\btour\\s*[:=]\\s*\\{?\\s*["'\`]${target}["'\`]`);
  return code.some((source) => literal.test(source));
}

const stops = tourIds.flatMap((id) => tours[id].stops.map((stop) => ({ tour: id, ...stop })));

describe("the Tour registry", () => {
  test.each(stops)("$tour/$id targets an anchor that exists ($target)", ({ target }) => {
    expect(anchored(target)).toBe(true);
  });

  test.each(stops)(`$tour/$id has a title of at most ${TITLE_MAX} characters`, ({ title }) => {
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  test.each(stops)(`$tour/$id has a body of at most ${BODY_MAX} characters`, ({ body }) => {
    expect(body.length).toBeLessThanOrEqual(BODY_MAX);
  });

  test("Stop ids are unique within a Tour", () => {
    for (const id of tourIds) {
      const ids = tours[id].stops.map((stop) => stop.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("the scan sees an anchor, and misses one that isn't written anywhere", () => {
    expect(anchored("tab-picks")).toBe(true);
    expect(anchored("not-a-real-target")).toBe(false);
  });
});
