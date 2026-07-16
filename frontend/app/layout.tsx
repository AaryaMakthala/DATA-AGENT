import type { Metadata } from "next";
import { Playfair_Display, Inter, Space_Mono } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "AI Data Analyst",
  description: "Upload a CSV and get an automated profile, cleaning plan, charts, and algorithm recommendations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-cream text-ink">{children}</body>
    </html>
  );
}
