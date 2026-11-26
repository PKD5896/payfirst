import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCheckoutVariant = vi.fn();
const trackOrder = vi.fn();
vi.mock("@/lib/flagsmith", () => ({ getCheckoutVariant, trackOrder }));

const { POST } = await import("./route");

const post = (body: unknown, { cookie = "pf_vid=visitor-abc123", raw }: { cookie?: string | null; raw?: string } = {}) =>
  POST(
    new NextRequest("http://localhost/api/orders", {
      method: "POST",
      headers: cookie ? { cookie } : {},
      body: raw ?? JSON.stringify(body),
    }),
  );

describe("POST /api/orders", () => {
  beforeEach(() => {
    getCheckoutVariant.mockReset().mockResolvedValue("upi_discount");
    trackOrder.mockReset();
  });

  it("creates a UPI order with the shopper's variant and tracks it", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "upi" });
    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order.quote.total).toBe(1199 + 40 - 25);
    expect(trackOrder).toHaveBeenCalledWith("visitor-abc123", { paymentMethod: "upi", total: 1214, variant: "upi_discount" });
  });

  it("evaluates the variant without recording a second exposure", async () => {
    await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "upi" });
    expect(getCheckoutVariant).toHaveBeenCalledWith("visitor-abc123", { recordExposure: false });
  });

  it("charges COD the normal price even in a treatment variant", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "cod" });
    expect((await res.json()).quote.total).toBe(1239);
  });

  it("ignores any price sent by the client", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "upi", total: 1 });
    expect((await res.json()).quote.total).toBe(1214);
  });

  it.each([
    ["no cookie", null],
    ["malformed cookie", "pf_vid=<script>"],
  ])("rejects requests with %s", async (_label, cookie) => {
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "upi" }, { cookie });
    expect(res.status).toBe(400);
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies without tracking", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 99, paymentMethod: "upi" });
    expect(res.status).toBe(400);
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    expect((await post(null, { raw: "{not json" })).status).toBe(400);
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await post(null, { raw: JSON.stringify({ productId: "cotton-kurta", pad: "x".repeat(5_000) }) });
    expect(res.status).toBe(413);
    expect(getCheckoutVariant).not.toHaveBeenCalled();
  });
});
