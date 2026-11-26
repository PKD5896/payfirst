export const VISITOR_COOKIE = "pf_vid";

// Anonymous shopper IDs: letters, digits, dash, underscore. Rejects anything else.
const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Only same-site relative paths, so redirects can't be abused as open redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function isValidVisitorId(value: string | undefined | null): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}
