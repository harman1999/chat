/**
 * Runs once when the server starts (not at build time): production refuses to
 * boot on default or missing secrets. See server/lib/production-check.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { assertProductionConfig } = await import("@server/lib/production-check");
    assertProductionConfig();
  }
}
