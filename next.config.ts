import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Where the browser may connect to. Everything else — including a script that
 * somehow ran — cannot send data to another origin. The realtime gateway is a
 * separate origin, so it is named; in development the dev server's own socket
 * needs allowing too.
 */
const socket = process.env.NEXT_PUBLIC_WS_URL ?? "";
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js puts small inline scripts in every page; tightening this further
  // needs per-request nonces. Eval is development only (React's dev tooling).
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${socket}${isProduction ? "" : " ws://localhost:*"}`.trim(),
  "media-src 'self' blob:",
  // Nobody may frame the app (clickjacking), and nothing may be embedded in it.
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only meaningful over HTTPS, so only in production.
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Hides the round "N" route indicator Next.js draws over the page in
  // development. It is not part of the app, and never appears in production.
  // Compile and runtime errors still show; only the indicator goes.
  devIndicators: false,
  // No "X-Powered-By: Next.js": it only tells an attacker what to look up.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API answers carry personal data and must not be stored by any cache.
      // They are data, never pages, so nothing in one may run or load: if a
      // response (an uploaded file, say) were ever rendered by a browser, this
      // policy leaves it inert. Listed after the rule above so it wins for /api.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; sandbox" },
        ],
      },
    ];
  },
};

export default nextConfig;
