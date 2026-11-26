// Server-only Flagsmith client. Flags are evaluated locally (server-side key), so a page view
// costs no API request; exposures and conversions go to the Flagsmith events API in batches.
import { Flagsmith } from "@flagsmith/nodejs";
import { variantFromFlag, type PaymentMethod, type Variant } from "./nudges";

export const EXPERIMENT_FLAG = "checkout_nudge";

const globalForFlagsmith = globalThis as { __flagsmith?: Flagsmith | null };

function client(): Flagsmith | null {
  if (globalForFlagsmith.__flagsmith !== undefined) return globalForFlagsmith.__flagsmith;
  const key = process.env.FLAGSMITH_SERVER_KEY?.trim();
  if (!key) {
    console.warn("[flagsmith] FLAGSMITH_SERVER_KEY not set: everyone sees the control checkout and no events are sent.");
    return (globalForFlagsmith.__flagsmith = null);
  }
  return (globalForFlagsmith.__flagsmith = new Flagsmith({
    environmentKey: key,
    enableLocalEvaluation: true,
    enableEvents: true,
    // Large buffer + frequent flushes so bursts of simulated traffic are not dropped.
    eventProcessorConfig: { maxBuffer: 20_000, flushInterval: 2_000 },
  }));
}

/** Variant for this shopper. Records an exposure when the experiment is running. Never throws. */
export async function getCheckoutVariant(visitorId: string): Promise<Variant> {
  const flagsmith = client();
  if (!flagsmith) return "control";
  try {
    const flag = await flagsmith.getExperimentFlag(EXPERIMENT_FLAG, visitorId);
    return "featureId" in flag ? variantFromFlag(flag) : "control"; // DefaultFlag → control
  } catch (err) {
    console.error("[flagsmith] flag evaluation failed, falling back to control:", err);
    return "control";
  }
}

/** Conversion events for the experiment's goal and guardrail metrics. Never throws. */
export function trackOrder(visitorId: string, order: { paymentMethod: PaymentMethod; total: number; variant: Variant }) {
  const flagsmith = client();
  if (!flagsmith) return;
  try {
    const metadata = { variant: order.variant, payment_method: order.paymentMethod };
    flagsmith.trackEvent("checkout_completed", { identifier: visitorId, value: order.total, metadata });
    if (order.paymentMethod === "upi") {
      flagsmith.trackEvent("prepaid_order_completed", { identifier: visitorId, value: order.total, metadata });
    }
  } catch (err) {
    console.error("[flagsmith] failed to track order events:", err);
  }
}
