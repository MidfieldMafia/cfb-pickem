import type { Metadata, Viewport } from "next";
import { Chivo, Manrope } from "next/font/google";
import "./globals.css";

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
    statusBarStyle: "default",
  },
  // Next emits only the modern `mobile-web-app-capable`. iOS before 16.4 reads
  // nothing but the Apple-prefixed one, and without it a home screen launch
  // opens in browser chrome and navigator.standalone stays false.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F1E3" },
    { media: "(prefers-color-scheme: dark)", color: "#1C1714" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${chivo.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
