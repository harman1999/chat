import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emits `.next/standalone` — a self-contained server with only the
   * dependencies actually reached, so the runtime image does not carry
   * `node_modules` and is roughly a tenth the size.
   */
  output: "standalone",

  /**
   * The WebSocket gateway and the migration runner import from `server/`, which
   * lives outside `src`. Tracing it explicitly keeps the standalone bundle from
   * omitting files the gateway needs at runtime.
   */
  outputFileTracingIncludes: {
    "/api/**": ["./server/**/*"],
  },
};

export default nextConfig;
