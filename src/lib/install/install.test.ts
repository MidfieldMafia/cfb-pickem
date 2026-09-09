import { describe, expect, test } from "vitest";
import { readBrowser } from "./install";

/** Real strings, so a heuristic that drifts against a real device is caught here. */
const AGENTS = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.32.90",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.44.108]",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
};

describe("which install steps to show", () => {
  test("an iPhone in Safari gets the Share sheet steps", () => {
    expect(readBrowser(AGENTS.iphoneSafari)).toEqual({ phone: "ios", embedded: false });
  });

  test("an Android phone in Chrome gets the Chrome menu steps", () => {
    expect(readBrowser(AGENTS.androidChrome)).toEqual({ phone: "android", embedded: false });
  });

  test("a desktop browser gets neither", () => {
    expect(readBrowser(AGENTS.mac).phone).toBe("other");
  });

  test("Chrome on iOS is still an iPhone, not an embedded browser", () => {
    expect(readBrowser(AGENTS.iphoneChrome)).toEqual({ phone: "ios", embedded: false });
  });
});

describe("embedded browsers, where Add to Home Screen may be missing", () => {
  test("an app that names itself is caught", () => {
    expect(readBrowser(AGENTS.iphoneFacebook).embedded).toBe(true);
  });

  test("an iOS web view without the Safari token is caught", () => {
    expect(readBrowser(AGENTS.iphoneInstagram).embedded).toBe(true);
  });

  test("an Android web view marks itself wv", () => {
    expect(readBrowser(AGENTS.androidWebview)).toEqual({ phone: "android", embedded: true });
  });

  test("a Safari View Controller passes as Safari, so an iPhone is only warned on proof", () => {
    // It sends Safari's own user agent. Since iOS 17 its share sheet has Add
    // to Home Screen as well, so nothing is lost by not warning here.
    expect(readBrowser(AGENTS.iphoneSafari).embedded).toBe(false);
  });
});
