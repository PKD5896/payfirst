import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { Variant } from "../src/lib/nudges";

const BASE_URL = "http://127.0.0.1:3200";
const SINK = "http://127.0.0.1:3299";

export type SentEvent = { event: string; identifier?: string; value?: unknown; metadata?: Record<string, unknown> };

/**
 * Gives the browser a fresh shopper ID that Flagsmith buckets into `variant`, using the real
 * environment's bucketing (via the checkout's debug label). Leaves the page on that checkout.
 */
export async function shopperIn(
  variant: Variant,
  context: BrowserContext,
  page: Page,
  product = "cotton-kurta",
): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const id = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await context.clearCookies();
    await context.addCookies([{ name: "pf_vid", value: id, url: BASE_URL }]);
    await page.goto(`/checkout?product=${product}&debug=1`);
    const seen = (await page.getByTestId("debug-variant").locator("code").textContent())?.trim();
    if (seen === variant) return id;
  }
  throw new Error(`No shopper landed in ${variant} after 40 tries`);
}

/** Conversion events (not exposures) the sink has received for one shopper. */
export async function conversionsFor(id: string): Promise<SentEvent[]> {
  const all = (await (await fetch(`${SINK}/events`)).json()) as SentEvent[];
  return all.filter((e) => e.identifier === id && !e.event.startsWith("$"));
}

export async function exposuresFor(id: string): Promise<SentEvent[]> {
  const all = (await (await fetch(`${SINK}/events`)).json()) as SentEvent[];
  return all.filter((e) => e.identifier === id && e.event === "$flag_exposure");
}

/** Waits until this shopper's conversion event names (sorted) match `expected`. */
export async function expectConversions(id: string, expected: string[]) {
  await expect
    .poll(async () => (await conversionsFor(id)).map((e) => e.event).sort(), { timeout: 15_000, intervals: [500] })
    .toEqual([...expected].sort());
}
