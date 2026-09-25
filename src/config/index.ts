/**
 * Static configuration.
 *
 * Distinct from `src/data`, which holds fixtures that stand in for the API.
 * These values are genuinely part of the build — the list of supported
 * languages is not workspace content — so they belong in the bundle.
 */
export { LANGUAGES, TIMEZONES, STATUS_PRESETS, defaultPreferences } from "./preferences";
export { authProviders } from "./auth-providers";
