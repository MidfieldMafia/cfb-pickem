/**
 * The live CollegeFootballData client, through the `fetchImpl` it has always
 * taken and nothing ever passed. Every other CFBD suite runs on `recordedCfbd`,
 * so until now the one adapter that actually talks to the API was the only
 * unverified part of the seam: the URLs, the query strings, the two defaults
 * baked in here rather than at the call sites, and the key on the header.
 *
 * These are worth pinning because they are invisible from inside the app. A
 * dropped `classification` still type-checks, still returns games, and quietly
 * bills FCS matchups against a 5,000-call monthly quota.
 */
import { describe, expect, test } from "vitest";
import { CfbdError, httpCfbd } from "./http";

const WEEK = { year: 2026, week: 2 } as const;

/**
 * A `fetch` that answers everything with `body` and records what it was asked
 * for. Each call is kept as its parsed URL, so a test asserts on the path and
 * the params rather than on string order.
 */
function spyFetch(body: unknown = [], init: { ok?: boolean; status?: number } = {}) {
  const calls: { url: URL; headers: Headers }[] = [];
  const impl = (async (input: URL | RequestInfo, options?: RequestInit) => {
    calls.push({ url: new URL(String(input)), headers: new Headers(options?.headers) });
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
  return { impl, calls, only: () => calls[0] };
}

/** The query string as a plain object, so an assertion reads as the request. */
const paramsOf = (url: URL) => Object.fromEntries(url.searchParams);

/** The `CfbdError` a call threw, so its fields can be read rather than matched. */
async function refusalOf(run: () => Promise<unknown>): Promise<CfbdError> {
  try {
    await run();
  } catch (error) {
    return error as CfbdError;
  }
  throw new Error("The client resolved a response it should have thrown on.");
}

describe("the request the live client builds", () => {
  test("games asks for the FBS regular season for one week", async () => {
    const fetch = spyFetch();
    await httpCfbd("secret", fetch.impl).games(WEEK);

    const { url } = fetch.only();
    expect(url.origin).toBe("https://api.collegefootballdata.com");
    expect(url.pathname).toBe("/games");
    expect(paramsOf(url)).toEqual({
      year: "2026",
      week: "2",
      // Neither of these is passed by any caller: the client is where the app
      // decides it means FBS regular-season football.
      seasonType: "regular",
      classification: "fbs",
    });
  });

  test("the key rides on the Authorization header and never in the query", async () => {
    const fetch = spyFetch();
    await httpCfbd("secret-key", fetch.impl).games(WEEK);

    const { url, headers } = fetch.only();
    expect(headers.get("Authorization")).toBe("Bearer secret-key");
    expect(url.search).not.toContain("secret-key");
  });

  test("the scoreboard asks for the FBS board and nothing else, because the endpoint takes no week", async () => {
    const fetch = spyFetch();
    await httpCfbd("secret", fetch.impl).scoreboard();

    const { url } = fetch.only();
    expect(url.pathname).toBe("/scoreboard");
    expect(paramsOf(url)).toEqual({ classification: "fbs" });
  });

  test("every week-scoped endpoint carries the regular-season default", async () => {
    const fetch = spyFetch();
    const client = httpCfbd("secret", fetch.impl);

    await client.lines(WEEK);
    await client.media(WEEK);
    await client.pregameWinProbability(WEEK);
    await client.weather(WEEK);

    expect(fetch.calls.map(({ url }) => [url.pathname, paramsOf(url)])).toEqual([
      ["/lines", { year: "2026", week: "2", seasonType: "regular" }],
      ["/games/media", { year: "2026", week: "2", seasonType: "regular" }],
      ["/metrics/wp/pregame", { year: "2026", week: "2", seasonType: "regular" }],
      // On the $1 tier, which is why it is a call at all rather than a guess.
      ["/games/weather", { year: "2026", week: "2", seasonType: "regular" }],
    ]);
  });

  test("the season-wide endpoints take a year, and only two of them narrow it", async () => {
    const fetch = spyFetch();
    const client = httpCfbd("secret", fetch.impl);

    await client.rankings(2026);
    await client.seasonGames(2026);
    await client.records(2026);
    await client.teamStats(2026);
    await client.venues();

    expect(fetch.calls.map(({ url }) => [url.pathname, paramsOf(url)])).toEqual([
      ["/rankings", { year: "2026", seasonType: "regular" }],
      // The season-wide games call narrows to FBS the same way the weekly one does.
      ["/games", { year: "2026", seasonType: "regular", classification: "fbs" }],
      ["/records", { year: "2026" }],
      ["/stats/season", { year: "2026" }],
      // Venues are not a season's; no params at all.
      ["/venues", {}],
    ]);
  });

  test("a week is passed through as given rather than defaulted", async () => {
    const fetch = spyFetch();
    await httpCfbd("secret", fetch.impl).games({ year: 2025, week: 14 });

    expect(paramsOf(fetch.only().url)).toMatchObject({ year: "2025", week: "14" });
  });
});

describe("when the API refuses", () => {
  test("the status and the path come back on the error, and the body is never read", async () => {
    let read = false;
    const impl = (async () =>
      ({
        ok: false,
        status: 429,
        json: async () => {
          read = true;
          return {};
        },
      }) as unknown as Response) as typeof fetch;

    await expect(httpCfbd("secret", impl).games(WEEK)).rejects.toThrow(CfbdError);
    await expect(httpCfbd("secret", impl).games(WEEK)).rejects.toThrow(
      "CollegeFootballData returned 429 for /games.",
    );
    expect(read).toBe(false);
  });

  test("the error carries the status as a field, so a caller can tell quota from a fault", async () => {
    const fetch = spyFetch([], { ok: false, status: 401 });

    const error = await refusalOf(() => httpCfbd("bad-key", fetch.impl).venues());

    expect(error).toBeInstanceOf(CfbdError);
    expect(error.status).toBe(401);
  });
});

describe("the response", () => {
  test("comes back as the endpoint's own shape, parsed once", async () => {
    const games = [{ id: 1, completed: false }];
    const fetch = spyFetch(games);

    expect(await httpCfbd("secret", fetch.impl).games(WEEK)).toEqual(games);
    expect(fetch.calls).toHaveLength(1);
  });
});
