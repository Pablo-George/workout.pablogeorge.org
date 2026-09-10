const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The server's own calendar day, in UTC. Only a fallback — it can be a day
 *  off from any given user's actual local day around midnight. */
export function serverToday(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Resolves "today" for date-keyed logs (body weight, calories, training max).
 * The server has no reliable notion of the user's timezone, so callers should
 * pass the local date the browser already computed (e.g. via
 * `new Date().toLocaleDateString('en-CA')`) whenever one is available. Falls
 * back to the server's UTC day only when the client didn't send one.
 */
export function resolveLocalDate(clientDate: unknown): string {
  return typeof clientDate === "string" && LOCAL_DATE_RE.test(clientDate) ? clientDate : serverToday();
}
