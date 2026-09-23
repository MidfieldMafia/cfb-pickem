/**
 * A user agent as the console shows it: "iPhone · Safari". A commissioner
 * reading a bug wants the phone and the browser, not the raw string, which is
 * kept whole in the row in case this ever reads it wrong.
 *
 * Order matters in both lists. Every iOS browser says "Safari" and every
 * Chromium one says "Chrome", so the specific names are checked first.
 */
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/CrOS/, "Chromebook"],
  [/Linux/, "Linux"],
];

const BROWSERS: [RegExp, string][] = [
  [/CriOS/, "Chrome"],
  [/FxiOS|Firefox\//, "Firefox"],
  [/EdgiOS|EdgA|Edg\//, "Edge"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/OPR\/|OPiOS/, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

export function deviceLabel(userAgent: string): string {
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  let browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  // Added to the Home Screen, iOS drops the "Safari" token and says nothing else.
  if (!browser && (system === "iPhone" || system === "iPad") && /AppleWebKit/.test(userAgent)) browser = "Home Screen app";
  if (!system && !browser) return "Unknown device";
  return [system, browser].filter(Boolean).join(" · ");
}
