export const VISITOR_COOKIE = "pf_vid";

// Anonymous shopper IDs: letters, digits, dash, underscore. Rejects anything else.
const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidVisitorId(value: string | undefined | null): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}
