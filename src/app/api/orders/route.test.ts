import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined) }),
}));

const getCheckoutVariant = vi.fn();
const trackOrder = vi.fn();
vi.mock("@/lib/flagsmith", () => ({ getCheckoutVariant, trackOrder }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/orders", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/orders", () => {
  beforeEach(() => {
    cookieJar.clear();
    cookieJar.set("pf_vid", "visitor-abc123");
    getCheckoutVariant.mockReset().mockResolvedValue("upi_discount");
    trackOrder.mockReset();
  });

  it("creates a UPI order with the shopper's variant and tracks it", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "upi" });
    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order.quote.total).toBe(1199 + 40 - 25);
    expect(getCheckoutVariant).toHaveBeenCalledWith("visitor-abc123");
    expect(trackOrder).toHaveBeenCalledWith("visitor-abc123", { paymentMethod: "upi", total: 1214, variant: "upi_discount" });
  });

  it("charges COD the normal price even in a treatment variant", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "cod" });
    expect((await res.json()).quote.total).toBe(1239);
  });

  it("rejects requests without a visitor cookie", async () => {
    cookieJar.clear();
    const res = await post({ productId: "cotton-kurta", qty: 1, paymentMethod: "upi" });
    expect(res.status).toBe(400);
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies without tracking", async () => {
    const res = await post({ productId: "cotton-kurta", qty: 99, paymentMethod: "upi" });
    expect(res.status).toBe(400);
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const res = await POST(new Request("http://localhost/api/orders", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });
});
