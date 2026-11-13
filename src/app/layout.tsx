import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { APPEARANCE_HEAD_SCRIPT } from "@/lib/appearance-colors";
import { APP } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${APP.name} — ${APP.tagline}`,
    template: `%s · ${APP.name}`,
  },
  description: APP.tagline,
  applicationName: APP.name,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#16181f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Restores a person's chosen sidebar / top bar colours before the first
            paint, from plain hex values cached by lib/appearance-colors.ts.
            Without it the default blue would flash on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_HEAD_SCRIPT }} />
      </head>
      {/* Browser extensions (Grammarly, password managers) add attributes to
          <body> before React loads. suppressHydrationWarning ignores attribute
          differences on this one element only; children are still checked. */}
      <body className={`${inter.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
