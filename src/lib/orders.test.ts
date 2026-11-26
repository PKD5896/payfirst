import { describe, expect, it } from "vitest";
import { MAX_QTY, buildOrder, getOrder, parseOrderRequest, saveOrder } from "./orders";
import { isValidVisitorId } from "./visitor";

describe("parseOrderRequest", () => {
  const valid = { productId: "cotton-kurta", qty: 1, paymentMethod: "upi" };

  it("accepts a valid request", () => {
    expect(parseOrderRequest(valid)).toEqual({ ok: true, value: valid });
  });

  it.each([
    ["non-object body", null],
    ["unknown product", { ...valid, productId: "nope" }],
    ["zero qty", { ...valid, qty: 0 }],
    ["fractional qty", { ...valid, qty: 1.5 }],
    ["too many", { ...valid, qty: MAX_QTY + 1 }],
    ["qty as string", { ...valid, qty: "1" }],
    ["unknown payment method", { ...valid, paymentMethod: "card" }],
  ])("rejects %s", (_label, body) => {
    expect(parseOrderRequest(body).ok).toBe(false);
  });
});

describe("buildOrder", () => {
  it("prices from the catalog and applies the variant", () => {
    const order = buildOrder({ productId: "cotton-kurta", qty: 2, paymentMethod: "upi" }, "upi_discount", "o1");
    expect(order.quote).toEqual({ subtotal: 2398, delivery: 40, discount: 25, total: 2413 });
    expect(order.variant).toBe("upi_discount");
  });

  it("round-trips through the store", () => {
    const order = buildOrder({ productId: "cotton-saree", qty: 1, paymentMethod: "cod" }, "control", "o2");
    saveOrder(order);
    expect(getOrder("o2")).toEqual(order);
    expect(getOrder("missing")).toBeUndefined();
  });
});

describe("isValidVisitorId", () => {
  it("accepts UUIDs and simulator IDs", () => {
    expect(isValidVisitorId(crypto.randomUUID())).toBe(true);
    expect(isValidVisitorId("sim-000123")).toBe(true);
  });

  it.each([undefined, "", "short", "has spaces in it", "x".repeat(65), "<script>alert(1)</script>"])("rejects %j", (id) => {
    expect(isValidVisitorId(id)).toBe(false);
  });
});
