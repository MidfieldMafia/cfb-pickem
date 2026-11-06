/**
 * The heartbeat's schedule sync (#546) against a fake QStash: an in-memory
 * stand-in for the three REST calls it makes (list, create-or-replace by id,
 * delete), answered through the `fetch` the sync is handed.
 */
import { describe, expect, test } from "vitest";
import { publishWeek2, seedWeek2, TUESDAY } from "@/test/week-2";
import { syncHeartbeat, syncSchedules, type HeartbeatConfig } from "./heartbeat-sync";

const TOKEN = "qstash-token-do-not-print";
const SECRET = "cron-secret-do-not-print";
const QSTASH = "https://qstash.test";
const DESTINATION = "https://slate.midfield-mafia.com/api/cron/live";
const CONFIG: HeartbeatConfig = { token: TOKEN, qstashUrl: QSTASH, secret: SECRET, destination: DESTINATION };

interface Stored {
  scheduleId: string;
  cron: string;
  destination: string;
  header: Record<string, string[]>;
}

/** The four fixed windows every production QStash held before #546. */
const FIXED = [
  { scheduleId: "slate-live-saturday-day", cron: "* 15-23 * * 6" },
  { scheduleId: "slate-live-saturday-night", cron: "* 0-8 * * 0" },
  { scheduleId: "slate-live-weeknight-evening", cron: "* 23 * * 2-5" },
  { scheduleId: "slate-live-weeknight-late", cron: "* 0-4 * * 3-6" },
];

/**
 * QStash's schedules, and the `fetch` that reaches them. `fail` names one call
 * to answer 500 instead, its body echoing the request's headers the way an
 * unhelpful upstream error might, so a test can see the secret never leaks.
 */
function fakeQStash(initial: Omit<Stored, "header">[] = [], fail?: (method: string, path: string) => boolean) {
  const schedules = new Map<string, Stored>(initial.map((s) => [s.scheduleId, { ...s, header: {} }]));
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const path = decodeURIComponent(url.pathname.replace(/^\/v2\/schedules\/?/, ""));
    calls.push(`${method} ${path}`);
    if (url.origin !== QSTASH || headers.get("authorization") !== `Bearer ${TOKEN}`) {
      return new Response("unauthorized", { status: 401 });
    }
    if (fail?.(method, path)) {
      return new Response(JSON.stringify({ error: "boom", echo: Object.fromEntries(headers) }), { status: 500 });
    }
    if (method === "GET") return Response.json([...schedules.values()]);
    if (method === "POST") {
      const scheduleId = headers.get("upstash-schedule-id")!;
      const header: Record<string, string[]> = {};
      headers.forEach((value, name) => {
        if (name.startsWith("upstash-forward-")) header[name.slice("upstash-forward-".length)] = [value];
      });
      schedules.set(scheduleId, { scheduleId, cron: headers.get("upstash-cron")!, destination: path, header });
      calls.push(`  retries ${headers.get("upstash-retries")}`);
      return Response.json({ scheduleId });
    }
    if (method === "DELETE") {
      schedules.delete(path);
      return new Response(null, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  const crons = () => Object.fromEntries([...schedules.values()].map((s) => [s.scheduleId, s.cron]));
  return { fetch, schedules, calls, crons };
}

const on = (destination: string) => (s: { scheduleId: string; cron: string }) => ({ ...s, destination });

/** Week 10: Saturday 7 November, 17:00 to 00:30 UTC kickoffs. */
const WEEK_10 = [
  { kickoff: new Date("2026-11-07T17:00:00Z"), void: false },
  { kickoff: new Date("2026-11-07T20:30:00Z"), void: false },
  { kickoff: new Date("2026-11-08T00:30:00Z"), void: false },
];
const NOV_3 = new Date("2026-11-03T12:00:00Z");

function capture() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("syncing the heartbeat schedules", () => {
  test("creates the slate's dates and deletes the four fixed windows, after the replacements exist", async () => {
    const qstash = fakeQStash(FIXED.map(on(DESTINATION)));
    const { log } = capture();

    const result = await syncSchedules(WEEK_10, CONFIG, { fetch: qstash.fetch, now: NOV_3, log });

    expect(result).toEqual({
      status: "synced",
      created: ["slate-live-2026-11-07", "slate-live-2026-11-08"],
      replaced: [],
      deleted: FIXED.map((s) => s.scheduleId),
    });
    expect(qstash.crons()).toEqual({
      "slate-live-2026-11-07": "* 17-23 7 11 *",
      "slate-live-2026-11-08": "* 0-5 8 11 *",
    });
    const creates = qstash.calls.filter((c) => c.startsWith("POST"));
    const deletes = qstash.calls.filter((c) => c.startsWith("DELETE"));
    expect(qstash.calls.indexOf(creates.at(-1)!)).toBeLessThan(qstash.calls.indexOf(deletes[0]));
    expect(creates).toEqual([`POST ${DESTINATION}`, `POST ${DESTINATION}`]);
  });

  test("every schedule forwards the cron secret and has retries off", async () => {
    const qstash = fakeQStash();

    await syncSchedules(WEEK_10, CONFIG, { fetch: qstash.fetch, now: NOV_3, log: () => {} });

    for (const schedule of qstash.schedules.values()) {
      expect(schedule.header).toEqual({ authorization: [`Bearer ${SECRET}`] });
    }
    expect(qstash.calls.filter((c) => c.startsWith("  retries"))).toEqual(["  retries 0", "  retries 0"]);
  });

  test("replaces a date already there, deletes a past date, and leaves other destinations alone", async () => {
    const elsewhere = { scheduleId: "something-else", cron: "0 * * * *", destination: "https://other.test/hook" };
    const qstash = fakeQStash([
      on(DESTINATION)({ scheduleId: "slate-live-2026-11-07", cron: "* 15-23 7 11 *" }),
      on(DESTINATION)({ scheduleId: "slate-live-2026-10-31", cron: "* 16-23 31 10 *" }),
      elsewhere,
    ]);

    const result = await syncSchedules(WEEK_10, CONFIG, { fetch: qstash.fetch, now: NOV_3, log: () => {} });

    expect(result).toEqual({
      status: "synced",
      created: ["slate-live-2026-11-08"],
      replaced: ["slate-live-2026-11-07"],
      deleted: ["slate-live-2026-10-31"],
    });
    expect(qstash.crons()).toEqual({
      "something-else": "0 * * * *",
      "slate-live-2026-11-07": "* 17-23 7 11 *",
      "slate-live-2026-11-08": "* 0-5 8 11 *",
    });
  });

  test("an empty slate deletes every heartbeat schedule", async () => {
    const qstash = fakeQStash(FIXED.map(on(DESTINATION)));

    expect(await syncSchedules([], CONFIG, { fetch: qstash.fetch, now: NOV_3, log: () => {} })).toMatchObject({
      status: "synced",
      deleted: FIXED.map((s) => s.scheduleId),
    });
    expect(qstash.crons()).toEqual({});
  });

  test("a create failing midway deletes nothing, and says so without the secret or the token", async () => {
    let posts = 0;
    const qstash = fakeQStash(FIXED.map(on(DESTINATION)), (method) => method === "POST" && posts++ === 1);
    const { lines, log } = capture();

    const result = await syncSchedules(WEEK_10, CONFIG, { fetch: qstash.fetch, now: NOV_3, log });

    expect(result).toMatchObject({ status: "failed" });
    expect(qstash.calls.filter((c) => c.startsWith("DELETE"))).toEqual([]);
    for (const fixed of FIXED) expect(qstash.crons()[fixed.scheduleId]).toBe(fixed.cron);
    const output = JSON.stringify([result, lines]);
    expect(output).toContain("500");
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain(TOKEN);
  });

  test("a failed list or delete stops there and touches nothing after it", async () => {
    const listFails = fakeQStash(FIXED.map(on(DESTINATION)), (method) => method === "GET");
    expect(await syncSchedules(WEEK_10, CONFIG, { fetch: listFails.fetch, now: NOV_3, log: () => {} })).toMatchObject({
      status: "failed",
    });
    expect(listFails.calls).toEqual(["GET "]);

    const deleteFails = fakeQStash(FIXED.map(on(DESTINATION)), (method, path) => method === "DELETE" && path === FIXED[0].scheduleId);
    const result = await syncSchedules(WEEK_10, CONFIG, { fetch: deleteFails.fetch, now: NOV_3, log: () => {} });
    expect(result).toMatchObject({ status: "failed" });
    expect(deleteFails.calls.filter((c) => c.startsWith("DELETE"))).toEqual([`DELETE ${FIXED[0].scheduleId}`]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe("the app's sync", () => {
  const PRODUCTION = { VERCEL_ENV: "production", QSTASH_TOKEN: TOKEN, QSTASH_URL: QSTASH, CRON_SECRET: SECRET };

  test("syncs the published Slate's games to the production domain", async () => {
    const { db } = await publishWeek2();
    const qstash = fakeQStash(FIXED.map(on(DESTINATION)));
    const { lines, log } = capture();

    const result = await syncHeartbeat(db, { env: PRODUCTION, fetch: qstash.fetch, now: TUESDAY, log });

    expect(result).toMatchObject({ status: "synced", deleted: FIXED.map((s) => s.scheduleId) });
    const ids = Object.keys(qstash.crons());
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^slate-live-2026-09-1\d$/);
    for (const schedule of qstash.schedules.values()) expect(schedule.destination).toBe(DESTINATION);
    expect(lines.join("\n")).not.toContain(SECRET);
  });

  test("with no published Slate, clears the heartbeat schedules", async () => {
    const { db } = await seedWeek2();
    const qstash = fakeQStash(FIXED.map(on(DESTINATION)));

    expect(await syncHeartbeat(db, { env: PRODUCTION, fetch: qstash.fetch, now: TUESDAY, log: () => {} })).toMatchObject({
      status: "synced",
      created: [],
    });
    expect(qstash.crons()).toEqual({});
  });

  test("does nothing outside production, or without its QStash settings", async () => {
    const { db } = await publishWeek2();
    const qstash = fakeQStash(FIXED.map(on(DESTINATION)));
    const quiet = { fetch: qstash.fetch, now: TUESDAY, log: () => {} };

    for (const env of [
      { ...PRODUCTION, VERCEL_ENV: "preview" },
      { ...PRODUCTION, VERCEL_ENV: undefined },
      { ...PRODUCTION, QSTASH_TOKEN: undefined },
      { ...PRODUCTION, CRON_SECRET: " " },
    ]) {
      expect(await syncHeartbeat(db, { ...quiet, env })).toMatchObject({ status: "skipped" });
    }
    expect(qstash.calls).toEqual([]);
  });

  test("never throws: a QStash outage comes back as a failure", async () => {
    const { db } = await publishWeek2();
    const fetch = async () => {
      throw new Error("network down");
    };

    expect(await syncHeartbeat(db, { env: PRODUCTION, fetch, now: TUESDAY, log: () => {} })).toEqual({
      status: "failed",
      error: "network down",
    });
  });
});
