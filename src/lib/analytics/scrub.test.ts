import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { scrubEvent, scrubUrl } from "./scrub";

describe("scrubUrl", () => {
  it("hides a Magic Link token", () => {
    expect(scrubUrl("https://slate.example/m/AbC-123_xyz")).toBe("https://slate.example/m/[token]");
  });

  it("hides a Join Link token and keeps what follows it", () => {
    expect(scrubUrl("https://slate.example/join/AbC-123/open?x=1#top")).toBe(
      "https://slate.example/join/[token]/open?x=1#top",
    );
  });

  it("works on a bare pathname", () => {
    expect(scrubUrl("/join/AbC-123")).toBe("/join/[token]");
  });

  it("leaves every other page alone", () => {
    for (const url of ["/picks?game=12", "/manage/4", "/you/feedback", "/leaderboard", "/start/7"]) {
      expect(scrubUrl(url)).toBe(url);
    }
  });
});

describe("scrubEvent", () => {
  it("scrubs nested properties, arrays and person properties", () => {
    const event: CaptureResult = {
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url: "https://slate.example/join/secret",
        $pathname: "/join/secret",
        $referrer: "https://slate.example/m/secret",
        count: 3,
        $exception_list: [{ stacktrace: { frames: [{ filename: "https://slate.example/join/secret" }] } }],
      },
      $set_once: { $initial_current_url: "https://slate.example/m/secret" },
    };

    const text = JSON.stringify(scrubEvent(event));
    expect(text).not.toContain("secret");
    expect(scrubEvent(event)?.properties.count).toBe(3);
  });

  it("passes a dropped event through", () => {
    expect(scrubEvent(null)).toBeNull();
  });
});
