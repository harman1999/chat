import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the round "N" route indicator Next.js draws over the page in
  // development. It is not part of the app, and never appears in production.
  // Compile and runtime errors still show; only the indicator goes.
  devIndicators: false,
};

export default nextConfig;
