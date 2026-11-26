const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹1,199 · ₹1,23,456 (Indian digit grouping). */
export function formatINR(rupees: number): string {
  return inr.format(rupees);
}
