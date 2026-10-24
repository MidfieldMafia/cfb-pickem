import { describe, expect, test } from "vitest";
import { pushBlock } from "./device";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const on = { pushApi: true, permission: "default" as const };

describe("what blocks push on this device", () => {
  test("nothing, in the Home Screen app on iPhone and in Chrome on Android", () => {
    expect(pushBlock({ userAgent: IPHONE_SAFARI, installed: true, ...on })).toBeNull();
    expect(pushBlock({ userAgent: ANDROID_CHROME, installed: false, ...on })).toBeNull();
  });

  test("Safari on iPhone needs the Home Screen app, and so does a phone browser with no Push API", () => {
    expect(pushBlock({ userAgent: IPHONE_SAFARI, installed: false, pushApi: false, permission: "default" })).toBe("home_screen");
    expect(pushBlock({ userAgent: ANDROID_CHROME, installed: false, pushApi: false, permission: "default" })).toBe("home_screen");
  });

  test("a computer is sent to the phone, whatever its browser can do", () => {
    expect(pushBlock({ userAgent: MAC_CHROME, installed: false, ...on })).toBe("computer");
  });

  test("permission denied blocks it, because iOS never asks twice", () => {
    expect(pushBlock({ userAgent: IPHONE_SAFARI, installed: true, pushApi: true, permission: "denied" })).toBe("denied");
  });
});
