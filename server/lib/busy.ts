/**
 * Thrown when work that must not pile up is already at capacity.
 *
 * `handler()` turns it into a quick 503 with Retry-After, rather than letting
 * the request wait in a long queue (or, worse, drag down everything else).
 */
export class BusyError extends Error {
  constructor() {
    super("The server is busy");
    this.name = "BusyError";
  }
}
