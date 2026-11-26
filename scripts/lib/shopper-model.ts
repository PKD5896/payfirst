// How simulated shoppers behave. These are ASSUMPTIONS, stated openly: simulated results
// reflect them. Baseline UPI shares are anchored to real data; the variant effects are
// plausible guesses, not measurements.
import type { Variant } from "../../src/lib/nudges";

/** Prepaid share of orders by city tier, 2025 (ClickPost, 635M orders, via Social Samosa, Dec 2025). */
export const TIERS = [
  { name: "metro", share: 0.4, baseUpi: 0.46 },
  { name: "tier2", share: 0.35, baseUpi: 0.4 },
  { name: "tier3", share: 0.25, baseUpi: 0.345 },
] as const;
export type Tier = (typeof TIERS)[number]["name"];

/** Assumed share of shoppers who leave the checkout without ordering. */
export const ABANDON: Record<Variant, number> = { control: 0.3, upi_discount: 0.28, free_delivery: 0.27 };

/**
 * Assumed increase (in percentage points) in the chance an ordering shopper pays by UPI.
 * Free delivery is assumed stronger than ₹25 off: shoppers tend to over-respond to "free"
 * (the zero-price effect), even though it also costs the seller more (₹40 vs ₹25).
 */
export const UPI_LIFT: Record<Variant, number> = { control: 0, upi_discount: 0.06, free_delivery: 0.09 };

export type Outcome = { tier: Tier; result: "abandon" | "upi" | "cod" };

export function pickTier(rand: () => number): (typeof TIERS)[number] {
  let r = rand();
  for (const t of TIERS) {
    if ((r -= t.share) < 0) return t;
  }
  return TIERS[TIERS.length - 1];
}

export function decide(variant: Variant, rand: () => number): Outcome {
  const tier = pickTier(rand);
  if (rand() < ABANDON[variant]) return { tier: tier.name, result: "abandon" };
  return { tier: tier.name, result: rand() < tier.baseUpi + UPI_LIFT[variant] ? "upi" : "cod" };
}

/** Expected share of exposed shoppers who complete a prepaid order, under this model. */
export function expectedPrepaidRate(variant: Variant): number {
  const upiShare = TIERS.reduce((acc, t) => acc + t.share * (t.baseUpi + UPI_LIFT[variant]), 0);
  return (1 - ABANDON[variant]) * upiShare;
}

/** Small, fast, seedable PRNG (mulberry32) so simulation runs are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
