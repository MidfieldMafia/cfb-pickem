import type { MetadataRoute } from "next";

/**
 * What makes Saturday Slate installable. Chrome needs a manifest with 192 and
 * 512 icons, a start URL, and a standalone display mode before it will offer
 * to install at all; iOS reads the name and colors for the launch screen.
 *
 * No service worker — see docs/research/pwa-install-and-manifest.md. Neither
 * platform needs one to install, and a cache in front of live scores is a way
 * to show a stale Saturday.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saturday Slate",
    // What fits under a home screen icon before iOS starts truncating.
    short_name: "Sat Slate",
    description: "Family college football pick'em.",
    start_url: "/",
    display: "standalone",
    // Paper and pine, the light theme's --background and --primary.
    background_color: "#F7F1E3",
    theme_color: "#F7F1E3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
