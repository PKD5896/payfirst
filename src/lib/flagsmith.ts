// Server-only Flagsmith client. Flags are evaluated locally (server-side key), so a page view
// costs no API request; exposures and conversions go to the Flagsmith events API in batches.
//
// Resilience (measured with `npm run loadtest -- --scenario flagsmith-hang|flagsmith-down`):
// - every evaluation has a time budget; past it the shopper gets the control checkout
// - after a failure, a short circuit-breaker serves control without touching the SDK,
//   so an outage cannot add latency to every request or flood the logs
// - the environment is loaded at server start (src/instrumentation.ts), so once warm,
//   flags keep evaluating from the cached environment even if Flagsmith goes down
import { Flagsmith } from "@flagsmith/nodejs";
import { variantFromFlag, type PaymentMethod, type Variant } from "./nudges";

export const EXPERIMENT_FLAG = "checkout_nudge";
export const EVALUATION_BUDGET_MS = 500;
export const COOLDOWN_MS = 5_000;

type State = { client?: Flagsmith | null; unavailableUntil: number };
const state = ((globalThis as { __flagsmith?: State }).__flagsmith ??= { unavailableUntil: 0 });

function client(): Flagsmith | null {
  if (state.client !== undefined) return state.client;
  const key = process.env.FLAGSMITH_SERVER_KEY?.trim();
  if (!key) {
    console.warn("[flagsmith] FLAGSMITH_SERVER_KEY not set: everyone sees the control checkout and no events are sent.");
    return (state.client = null);
  }
  return (state.client = new Flagsmith({
    environmentKey: key,
    enableLocalEvaluation: true,
    enableEvents: true,
    requestTimeoutSeconds: 5,
    // Optional overrides for self-hosted Flagsmith (and the load-test harness).
    apiUrl: process.env.FLAGSMITH_API_URL || undefined,
    // Large buffer + frequent flushes so bursts of traffic are not dropped.
    eventProcessorConfig: {
      maxBuffer: 20_000,
      flushInterval: 2_000,
      eventsApiUrl: process.env.FLAGSMITH_EVENTS_API_URL || undefined,
    },
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Flagsmith evaluation exceeded ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function markUnavailable(err: unknown) {
  const wasAvailable = Date.now() >= state.unavailableUntil;
  state.unavailableUntil = Date.now() + COOLDOWN_MS;
  if (wasAvailable) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[flagsmith] unavailable (${reason}); serving the control checkout for ${COOLDOWN_MS / 1000}s`);
  }
}

/**
 * Variant for this shopper. Never throws, never waits longer than EVALUATION_BUDGET_MS.
 * `recordExposure` should be true only where the shopper actually sees the variant (checkout page).
 */
export async function getCheckoutVariant(visitorId: string, { recordExposure = true } = {}): Promise<Variant> {
  const flagsmith = client();
  if (!flagsmith || Date.now() < state.unavailableUntil) return "control";
  try {
    const evaluation = recordExposure
      ? flagsmith.getExperimentFlag(EXPERIMENT_FLAG, visitorId)
      : flagsmith.getIdentityFlags(visitorId).then((flags) => flags.getFlag(EXPERIMENT_FLAG));
    const flag = await withTimeout(evaluation, EVALUATION_BUDGET_MS);
    return "featureId" in flag ? variantFromFlag(flag) : "control"; // missing/default flag → control
  } catch (err) {
    markUnavailable(err);
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

/** Loads the environment so the first shoppers don't wait for it. Waits at most `maxWaitMs`. */
export async function warmUp(maxWaitMs = 3_000): Promise<void> {
  const flagsmith = client();
  if (!flagsmith) return;
  const started = Date.now();
  try {
    await withTimeout(flagsmith.getEnvironmentFlags(), maxWaitMs);
    console.log(`[flagsmith] environment loaded in ${Date.now() - started} ms`);
  } catch (err) {
    markUnavailable(err);
  }
}

/** Test hook: forget the client and circuit-breaker state. */
export function resetForTests() {
  state.client = undefined;
  state.unavailableUntil = 0;
}
