import { describe, expect, it } from "vitest";
import { formatINR } from "./format";

describe("formatINR", () => {
  it("formats rupees with Indian digit grouping and no paise", () => {
    expect(formatINR(1199)).toBe("₹1,199");
    expect(formatINR(123456)).toBe("₹1,23,456");
    expect(formatINR(0)).toBe("₹0");
  });
});
