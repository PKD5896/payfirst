import { describe, expect, it } from "vitest";
import { DELIVERY_FEE, UPI_DISCOUNT, nudgeFor, quote, toVariant, variantFromFlag } from "./nudges";

describe("variantFromFlag", () => {
  it("uses the variant when the shopper is enrolled in a running experiment", () => {
    expect(variantFromFlag({ variant: "upi_discount", experiment: { inExperiment: true } })).toBe("upi_discount");
  });

  it("shows control to shoppers outside the rollout, even though they have a bucket", () => {
    expect(variantFromFlag({ variant: "upi_discount", experiment: { inExperiment: false } })).toBe("control");
  });

  it("uses the served variant when no experiment is running (draft or rolled-out winner)", () => {
    expect(variantFromFlag({ variant: "free_delivery" })).toBe("free_delivery");
  });

  it("falls back to control for missing flags or unknown keys", () => {
    expect(variantFromFlag(null)).toBe("control");
    expect(variantFromFlag({})).toBe("control");
    expect(variantFromFlag({ variant: "mystery", experiment: { inExperiment: true } })).toBe("control");
  });
});

describe("toVariant", () => {
  it.each(["control", "upi_discount", "free_delivery"])("keeps known key %s", (key) => {
    expect(toVariant(key)).toBe(key);
  });

  it.each([undefined, null, "", "UPI_DISCOUNT", "cod_fee", 42, {}])("falls back to control for %j", (key) => {
    expect(toVariant(key)).toBe("control");
  });
});

describe("quote", () => {
  const subtotal = 1199;

  it("control: same price for UPI and COD", () => {
    const expected = { subtotal, delivery: DELIVERY_FEE, discount: 0, total: subtotal + DELIVERY_FEE };
    expect(quote(subtotal, "control", "upi")).toEqual(expected);
    expect(quote(subtotal, "control", "cod")).toEqual(expected);
  });

  it("upi_discount: ₹25 off only when paying by UPI", () => {
    expect(quote(subtotal, "upi_discount", "upi")).toEqual({
      subtotal,
      delivery: DELIVERY_FEE,
      discount: UPI_DISCOUNT,
      total: subtotal + DELIVERY_FEE - UPI_DISCOUNT,
    });
    expect(quote(subtotal, "upi_discount", "cod").total).toBe(subtotal + DELIVERY_FEE);
  });

  it("free_delivery: delivery waived only when paying by UPI", () => {
    expect(quote(subtotal, "free_delivery", "upi")).toEqual({ subtotal, delivery: 0, discount: 0, total: subtotal });
    expect(quote(subtotal, "free_delivery", "cod").total).toBe(subtotal + DELIVERY_FEE);
  });

  it("never charges COD more than control (no COD fee / dark pattern)", () => {
    for (const variant of ["upi_discount", "free_delivery"] as const) {
      expect(quote(subtotal, variant, "cod").total).toBe(quote(subtotal, "control", "cod").total);
    }
  });

  it("caps the discount at the subtotal", () => {
    expect(quote(10, "upi_discount", "upi").discount).toBe(10);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid subtotal %s", (bad) => {
    expect(() => quote(bad, "control", "upi")).toThrow(RangeError);
  });
});

describe("nudgeFor", () => {
  it("control shows no nudge", () => {
    expect(nudgeFor("control")).toEqual({ badge: null, message: null });
  });

  it("treatments show a badge and a message", () => {
    expect(nudgeFor("upi_discount").badge).toContain("₹25");
    expect(nudgeFor("free_delivery").badge).toMatch(/free delivery/i);
  });
});
