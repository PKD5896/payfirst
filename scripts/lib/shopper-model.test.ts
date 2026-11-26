import { describe, expect, it } from "vitest";
import { ABANDON, TIERS, decide, expectedPrepaidRate, pickTier, seededRandom } from "./shopper-model";

describe("shopper model", () => {
  it("tier shares sum to 1", () => {
    expect(TIERS.reduce((a, t) => a + t.share, 0)).toBeCloseTo(1);
  });

  it("seeded randomness is reproducible and in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("picks tiers in proportion to their share", () => {
    const rand = seededRandom(1);
    const counts = { metro: 0, tier2: 0, tier3: 0 };
    for (let i = 0; i < 20_000; i++) counts[pickTier(rand).name]++;
    expect(counts.metro / 20_000).toBeCloseTo(0.4, 1);
    expect(counts.tier3 / 20_000).toBeCloseTo(0.25, 1);
  });

  it("simulated outcomes converge on the model's expected rates", () => {
    for (const variant of ["control", "upi_discount", "free_delivery"] as const) {
      const rand = seededRandom(7);
      let upi = 0;
      let abandon = 0;
      const n = 40_000;
      for (let i = 0; i < n; i++) {
        const { result } = decide(variant, rand);
        if (result === "upi") upi++;
        if (result === "abandon") abandon++;
      }
      expect(upi / n).toBeCloseTo(expectedPrepaidRate(variant), 2);
      expect(abandon / n).toBeCloseTo(ABANDON[variant], 2);
    }
  });

  it("orders the variants as assumed: free delivery > ₹25 off > control", () => {
    expect(expectedPrepaidRate("free_delivery")).toBeGreaterThan(expectedPrepaidRate("upi_discount"));
    expect(expectedPrepaidRate("upi_discount")).toBeGreaterThan(expectedPrepaidRate("control"));
  });
});
