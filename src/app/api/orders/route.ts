import type { NextRequest } from "next/server";
import { getCheckoutVariant, trackOrder } from "@/lib/flagsmith";
import { MAX_BODY_BYTES, buildOrder, parseOrderRequest, saveOrder } from "@/lib/orders";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visitor";

export async function POST(request: NextRequest) {
  const visitorId = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!isValidVisitorId(visitorId)) {
    return Response.json({ error: "Missing visitor ID. Load the store first." }, { status: 400 });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Request body too large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  const parsed = parseOrderRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  // Same identity → same bucket, so this matches the variant shown at checkout. The checkout
  // page already recorded the exposure, so this evaluation doesn't record another one.
  const variant = await getCheckoutVariant(visitorId, { recordExposure: false });
  const order = buildOrder(parsed.value, variant, crypto.randomUUID());
  saveOrder(order);
  trackOrder(visitorId, { paymentMethod: order.paymentMethod, total: order.quote.total, variant });

  return Response.json(order, { status: 201 });
}
