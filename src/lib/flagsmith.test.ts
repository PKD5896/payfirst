import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = {
  getExperimentFlag: vi.fn(),
  getIdentityFlags: vi.fn(),
  getEnvironmentFlags: vi.fn(),
  trackEvent: vi.fn(),
};
const constructed: unknown[] = [];
vi.mock("@flagsmith/nodejs", () => ({
  Flagsmith: class {
    constructor(opts: unknown) {
      constructed.push(opts);
      return sdk;
    }
  },
}));

const fs = await import("./flagsmith");
const { COOLDOWN_MS, EVALUATION_BUDGET_MS, getCheckoutVariant, resetForTests, trackOrder, warmUp } = fs;

const enrolled = (variant: string) => ({ featureId: 1, variant, experiment: { inExperiment: true } });

describe("flagsmith wrapper", () => {
  beforeEach(() => {
    vi.stubEnv("FLAGSMITH_SERVER_KEY", "ser.test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    for (const fn of Object.values(sdk)) fn.mockReset();
    constructed.length = 0;
    resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("serves control and sends nothing without a server key", async () => {
    vi.stubEnv("FLAGSMITH_SERVER_KEY", "");
    expect(await getCheckoutVariant("v-12345678")).toBe("control");
    trackOrder("v-12345678", { paymentMethod: "upi", total: 100, variant: "control" });
    expect(constructed).toHaveLength(0);
  });

  it("creates one client with local evaluation and events enabled", async () => {
    sdk.getExperimentFlag.mockResolvedValue(enrolled("upi_discount"));
    await getCheckoutVariant("v-1aaaaaaa");
    await getCheckoutVariant("v-2aaaaaaa");
    expect(constructed).toHaveLength(1);
    expect(constructed[0]).toMatchObject({ environmentKey: "ser.test", enableLocalEvaluation: true, enableEvents: true });
  });

  it("records an exposure only when asked to", async () => {
    sdk.getExperimentFlag.mockResolvedValue(enrolled("upi_discount"));
    sdk.getIdentityFlags.mockResolvedValue({ getFlag: () => enrolled("free_delivery") });

    expect(await getCheckoutVariant("v-12345678")).toBe("upi_discount");
    expect(sdk.getExperimentFlag).toHaveBeenCalledWith("checkout_nudge", "v-12345678");

    expect(await getCheckoutVariant("v-12345678", { recordExposure: false })).toBe("free_delivery");
    expect(sdk.getExperimentFlag).toHaveBeenCalledTimes(1);
  });

  it("treats a missing flag (SDK default object) as control", async () => {
    sdk.getExperimentFlag.mockResolvedValue({ enabled: false, isDefault: true, value: undefined });
    expect(await getCheckoutVariant("v-12345678")).toBe("control");
  });

  it("falls back to control within the time budget when Flagsmith hangs", async () => {
    vi.useFakeTimers();
    sdk.getExperimentFlag.mockReturnValue(new Promise(() => {}));
    const result = getCheckoutVariant("v-12345678");
    await vi.advanceTimersByTimeAsync(EVALUATION_BUDGET_MS);
    expect(await result).toBe("control");
  });

  it("opens the circuit after a failure, then retries after the cooldown", async () => {
    vi.useFakeTimers();
    sdk.getExperimentFlag.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await getCheckoutVariant("v-12345678")).toBe("control");

    sdk.getExperimentFlag.mockResolvedValue(enrolled("upi_discount"));
    expect(await getCheckoutVariant("v-12345678")).toBe("control"); // circuit open: SDK not called
    expect(sdk.getExperimentFlag).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(COOLDOWN_MS);
    expect(await getCheckoutVariant("v-12345678")).toBe("upi_discount");
    expect(sdk.getExperimentFlag).toHaveBeenCalledTimes(2);
  });

  it("logs an outage once, not once per request", async () => {
    sdk.getExperimentFlag.mockRejectedValue(new Error("down"));
    for (let i = 0; i < 5; i++) await getCheckoutVariant(`v-${i}aaaaaaa`);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("tracks both events for UPI orders and only the guardrail for COD", () => {
    trackOrder("v-12345678", { paymentMethod: "upi", total: 1214, variant: "upi_discount" });
    expect(sdk.trackEvent.mock.calls.map((c) => c[0])).toEqual(["checkout_completed", "prepaid_order_completed"]);
    expect(sdk.trackEvent.mock.calls[0][1]).toMatchObject({ identifier: "v-12345678", value: 1214 });

    sdk.trackEvent.mockClear();
    trackOrder("v-12345678", { paymentMethod: "cod", total: 1239, variant: "upi_discount" });
    expect(sdk.trackEvent.mock.calls.map((c) => c[0])).toEqual(["checkout_completed"]);
  });

  it("never throws from trackOrder", () => {
    sdk.trackEvent.mockImplementation(() => {
      throw new Error("buffer exploded");
    });
    expect(() => trackOrder("v-12345678", { paymentMethod: "upi", total: 1, variant: "control" })).not.toThrow();
  });

  it("warmUp loads the environment, and opens the circuit if it can't", async () => {
    sdk.getEnvironmentFlags.mockResolvedValueOnce({});
    await warmUp();
    expect(sdk.getEnvironmentFlags).toHaveBeenCalledTimes(1);

    resetForTests();
    sdk.getEnvironmentFlags.mockRejectedValueOnce(new Error("401"));
    await warmUp();
    sdk.getExperimentFlag.mockResolvedValue(enrolled("upi_discount"));
    expect(await getCheckoutVariant("v-12345678")).toBe("control");
    expect(sdk.getExperimentFlag).not.toHaveBeenCalled();
  });
});
