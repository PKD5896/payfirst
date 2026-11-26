// Forgets the shopper's anonymous ID so the next page view is a brand-new shopper, who
// Flagsmith buckets afresh. Used by the debug link to preview variants honestly.
import type { NextRequest } from "next/server";
import { VISITOR_COOKIE, safeNext } from "@/lib/visitor";

export function GET(request: NextRequest) {
  const response = new Response(null, {
    status: 303,
    headers: { Location: safeNext(request.nextUrl.searchParams.get("next")) },
  });
  response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return response;
}
