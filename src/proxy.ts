// Gives every shopper a stable anonymous ID so Flagsmith buckets them into the same variant
// on every visit. On the first visit the ID is added to the incoming request too, so the
// page rendering this very request can already read it.
import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visitor";

export function proxy(request: NextRequest) {
  if (isValidVisitorId(request.cookies.get(VISITOR_COOKIE)?.value)) return NextResponse.next();

  const id = crypto.randomUUID();
  request.cookies.set(VISITOR_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: VISITOR_COOKIE,
    value: id,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
