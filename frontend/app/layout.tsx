import type { Metadata } from "next";
import { Playfair_Display, Inter, Space_Mono, Oswald } from "next/font/google";
import favicon from "./favicon.png";
import "./globals.css";

// In your RootLayout component, add spaceGrotesk.variable to the <html> or <body> tag
// so every element using the `font-display` class picks it up:
//
// <html lang="en" className={spaceGrotesk.variable}>
//   <body>{children}</body>
// </html>
//
// Then in your global CSS (wherever --font-display / .font-display is defined):
//
// .font-display {
//   font-family: var(--font-display), sans-serif;
// }

// Serif display face for headlines (with italic emphasis, per the references).
const fontDisplay = Playfair_Display({
  variable: "--font-display-src",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

// Clean sans for body copy.
const fontBody = Inter({
  variable: "--font-body-src",
  subsets: ["latin"],
});

// Mono for uppercase labels, nav links, and buttons.
const fontMono = Space_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Bold condensed face used ONLY for the "DATA AGENT" logo wordmark.
const fontLogo = Oswald({
  variable: "--font-logo-src",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI Data Analyst",
  description: "Upload a CSV and get an automated profile, cleaning plan, charts, and algorithm recommendations.",
  icons: {
    icon: { url: favicon.src, type: "image/png" },
    apple: { url: favicon.src, type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} ${fontLogo.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-cream text-ink">{children}</body>
    </html>
  );
}