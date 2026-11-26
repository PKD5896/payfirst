import { cookies } from "next/headers";
import { getCheckoutVariant, trackOrder } from "@/lib/flagsmith";
import { buildOrder, parseOrderRequest, saveOrder } from "@/lib/orders";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visitor";

export async function POST(request: Request) {
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!isValidVisitorId(visitorId)) {
    return Response.json({ error: "Missing visitor ID. Load the store first." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOrderRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  // Same identity → same bucket, so this matches the variant the shopper saw at checkout.
  const variant = await getCheckoutVariant(visitorId);
  const order = buildOrder(parsed.value, variant, crypto.randomUUID());
  saveOrder(order);
  trackOrder(visitorId, { paymentMethod: order.paymentMethod, total: order.quote.total, variant });

  return Response.json(order, { status: 201 });
}
