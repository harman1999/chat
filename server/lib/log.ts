/**
 * Structured logging.
 *
 * One JSON object per line, because a log aggregator can parse that and cannot
 * parse `console.log("thing failed", err)`. In development it prints a readable
 * line instead — JSON is for machines, and nobody reads it while iterating.
 *
 * Deliberately not a logging library: this is four functions, and a dependency
 * would bring transports, serialisers and a plugin system nobody here needs.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;
const asJson = process.env.NODE_ENV === "production" || process.env.LOG_FORMAT === "json";

export interface LogFields {
  [key: string]: unknown;
}

/**
 * An Error does not survive JSON.stringify — it serialises to `{}`. Pulling the
 * useful parts out explicitly is the difference between a usable log line and
 * an empty object where the cause should be.
 */
function serialiseError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      err: error.message,
      errName: error.name,
      // The stack is the point of logging an error; truncated so one failure
      // cannot fill a log budget.
      stack: error.stack?.split("\n").slice(0, 12).join("\n"),
      ...(error.cause ? { cause: String(error.cause) } : {}),
    };
  }
  return { err: String(error) };
}

function emit(level: Level, message: string, fields: LogFields = {}): void {
  if (LEVELS[level] < threshold) return;

  const { error, ...rest } = fields;
  const payload = {
    level,
    time: new Date().toISOString(),
    msg: message,
    service: process.env.APP_NAME ?? "helix",
    ...rest,
    ...(error !== undefined ? serialiseError(error) : {}),
  };

  const line = asJson
    ? JSON.stringify(payload)
    : `${level.toUpperCase().padEnd(5)} ${message}${
        Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""
      }${error !== undefined ? `\n${serialiseError(error).stack ?? ""}` : ""}`;

  // Errors and warnings to stderr so they survive a stdout-only pipe.
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};

/**
 * Where an error tracker is wired in.
 *
 * Kept as one named function rather than scattered vendor calls: adding Sentry,
 * Rollbar or anything else means implementing this and nothing else. It is
 * called for every unhandled error that reaches the API boundary, with the
 * request id that was also logged, so a report and a log line can be matched up.
 */
export function reportError(error: unknown, context: LogFields = {}): void {
  // No tracker configured — the structured log above is the record.
  //
  //   import * as Sentry from "@sentry/node";
  //   Sentry.captureException(error, { extra: context });
  void error;
  void context;
}
