// Maps the Flagsmith variant a shopper is bucketed into to the checkout offer they see,
// and prices an order. Pure functions: used by the checkout page, the order API and tests.

export const VARIANTS = ["control", "upi_discount", "free_delivery"] as const;
export type Variant = (typeof VARIANTS)[number];
export type PaymentMethod = "upi" | "cod";

export const DELIVERY_FEE = 40; // ₹, standard delivery
export const UPI_DISCOUNT = 25; // ₹ off when paying by UPI (variant upi_discount)

/** Unknown, missing or malformed variant keys fall back to control, so checkout never breaks. */
export function toVariant(key: unknown): Variant {
  return VARIANTS.includes(key as Variant) ? (key as Variant) : "control";
}

/** The parts of a Flagsmith flag we use (structurally matches the Node SDK's Flag). */
export type EvaluatedFlag = { variant?: string; experiment?: { inExperiment: boolean } };

/**
 * Which variant to render. While an experiment runs, a shopper outside its rollout is still
 * bucketed into a variant key, so enrollment (`inExperiment`) decides. With no running
 * experiment (draft, or a completed one that rolled out a winner) the served variant is used.
 */
export function variantFromFlag(flag: EvaluatedFlag | null | undefined): Variant {
  if (!flag) return "control";
  if (flag.experiment && !flag.experiment.inExperiment) return "control";
  return toVariant(flag.variant);
}

export type Nudge = {
  /** Short badge shown on the UPI option, or null for the neutral control checkout. */
  badge: string | null;
  /** One-line explanation shown under the payment options. */
  message: string | null;
};

export function nudgeFor(variant: Variant): Nudge {
  switch (variant) {
    case "upi_discount":
      return { badge: `₹${UPI_DISCOUNT} off`, message: `Pay by UPI and save ₹${UPI_DISCOUNT} on this order.` };
    case "free_delivery":
      return { badge: "Free delivery", message: `Pay by UPI and get free delivery (save ₹${DELIVERY_FEE}).` };
    case "control":
      return { badge: null, message: null };
  }
}

export type Quote = {
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
};

export function quote(subtotal: number, variant: Variant, method: PaymentMethod): Quote {
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new RangeError("subtotal must be a non-negative number");
  const upi = method === "upi";
  const delivery = upi && variant === "free_delivery" ? 0 : DELIVERY_FEE;
  const discount = upi && variant === "upi_discount" ? Math.min(UPI_DISCOUNT, subtotal) : 0;
  return { subtotal, delivery, discount, total: subtotal + delivery - discount };
}
