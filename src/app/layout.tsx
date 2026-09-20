import type { Metadata, Viewport } from "next";
import { Chivo, Manrope } from "next/font/google";
import { LaunchScreen } from "@/components/launch-screen";
import { LAUNCH_GUARD } from "@/lib/launch";
import { SPLASH_SCREENS, splashMedia, splashUrl } from "@/lib/splash";
import "./globals.css";

const PAPER = "#F7F1E3";

const chivo = Chivo({
  variable: "--font-chivo",
  subsets: ["latin"],
  weight: ["700", "900"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Saturday Slate",
  description: "Family college football pick'em.",
  // Icons come from the app/icon.svg and app/apple-icon.png file conventions,
  // which emit both the favicon and the apple-touch-icon link iOS needs for
  // the home screen. Declaring them here as well would shadow those files.
  appleWebApp: {
    // Turns an iOS home screen launch into a real standalone window, which is
    // also what makes navigator.standalone answer truthfully.
    capable: true,
    title: "Saturday Slate",
    // Content draws under the status bar; `body` pads itself back down by the
    // safe-area inset (see RootLayout) and a fixed strip keeps scrolled content
    // from showing through the translucent bar.
    statusBarStyle: "black-translucent",
    // The launch screen a Home Screen open shows while the app loads. iOS
    // matches the media query exactly, so the list lives with the script that
    // renders the images: src/lib/splash.ts.
    startupImage: SPLASH_SCREENS.map((screen) => ({ url: splashUrl(screen), media: splashMedia(screen) })),
  },
  // Next emits only the modern `mobile-web-app-capable`. iOS before 16.4 reads
  // nothing but the Apple-prefixed one, and without it a home screen launch
  // opens in browser chrome and navigator.standalone stays false.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  // Without `cover` every env(safe-area-inset-*) resolves to 0.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F1E3" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1714" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // LAUNCH_GUARD sets data-launched before hydration.
      suppressHydrationWarning
      className={`${chivo.variable} ${manrope.variable} h-full antialiased`}
      // The stylesheet sets the page color, but iOS paints the canvas white
      // between the launch splash going away and that stylesheet arriving.
      // The app is light-only (nothing sets `.dark`), so paper is always right.
      style={{ backgroundColor: PAPER }}
    >
      <body className="flex min-h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)] bg-background"
        />
        <script dangerouslySetInnerHTML={{ __html: LAUNCH_GUARD }} />
        <LaunchScreen />
        {children}
      </body>
    </html>
  );
}
