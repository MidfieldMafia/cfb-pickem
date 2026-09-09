/**
 * Which "add to home screen" instructions a member should see.
 *
 * The install steps are entirely manual — no browser exposes an API that adds
 * a home screen icon for you, and iOS has never implemented the one Chromium
 * install prompt that exists. So the only thing this module decides is which
 * set of words to show, from the user agent alone.
 *
 * See docs/research/pwa-install-and-manifest.md for the sources.
 */

export type Phone = "ios" | "android" | "other";

export interface Browser {
  phone: Phone;
  /**
   * An app's own embedded browser rather than the real one. Its share sheet
   * may have no "Add to Home Screen", so the member has to reopen the link in
   * Safari or Chrome first.
   *
   * This is only ever a lower bound: a Safari View Controller reports itself
   * as plain Safari and cannot be told apart here. That is acceptable because
   * iOS 17 gave it Add to Home Screen too, and a Magic Link tapped in Messages
   * opens the default browser app rather than an embed in the first place.
   */
  embedded: boolean;
}

/** Apps that name their embedded browser in the user agent. */
const EMBEDDED_TOKENS = [
  "FBAN", // Facebook
  "FBAV",
  "FB_IAB",
  "Instagram",
  "Snapchat",
  "Twitter",
  "LinkedInApp",
  "MicroMessenger", // WeChat
  "Line/",
  "GSA/", // the Google app
];

export function readBrowser(userAgent: string): Browser {
  const phone: Phone = /iPhone|iPad|iPod/.test(userAgent)
    ? "ios"
    : /Android/.test(userAgent)
      ? "android"
      : "other";
  return { phone, embedded: isEmbedded(userAgent, phone) };
}

function isEmbedded(userAgent: string, phone: Phone): boolean {
  if (EMBEDDED_TOKENS.some((token) => userAgent.includes(token))) return true;
  // A bare iOS WKWebView drops the "Safari/" token that Safari always carries.
  if (phone === "ios") return /AppleWebKit/.test(userAgent) && !/Safari\//.test(userAgent);
  // Android's WebView marks itself "wv" in the platform section.
  if (phone === "android") return /;\s*wv[;)]/.test(userAgent);
  return false;
}

/**
 * Whether this page is the installed app rather than a browser tab. Chromium
 * reflects the manifest's display mode into a media query; iOS predates that
 * and answers on `navigator.standalone` instead, so check both.
 */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || legacy === true;
}
