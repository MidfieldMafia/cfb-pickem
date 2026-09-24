import type { NextConfig } from "next";

/** PostHog's US cloud; the EU cloud is `eu.i.posthog.com` and `eu-assets.i.posthog.com`. */
const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_ASSETS = "https://us-assets.i.posthog.com";

const nextConfig: NextConfig = {
  // History merged into the Leaderboard (#242). A redirect passes the query
  // through, so `/history/results?week=6` lands on `/leaderboard?week=6`.
  // Temporary, because #244 points `/history/results` at the Week's Reveal.
  async redirects() {
    return [
      { source: "/history", destination: "/leaderboard", permanent: false },
      { source: "/history/results", destination: "/leaderboard", permanent: false },
    ];
  },
  // Analytics goes out through the app's own origin (see instrumentation-client.ts),
  // so a blocker that refuses posthog.com lets it through.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG_HOST}/:path*` },
    ];
  },
  // PostHog's endpoints end in a slash (`/e/`); the default redirect that strips
  // it would bounce every analytics request, beacons included.
  skipTrailingSlashRedirect: true,
  experimental: {
    serverActions: {
      // Feedback's screenshot (#237) may be up to 1 MB, and the 1 MB default
      // counts the whole multipart body, the text and boundaries included.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
