import { describe, expect, it } from "vitest";
import { chiSquarePValue, chiSquareTest, percentile } from "./stats";

describe("percentile", () => {
  const data = [10, 20, 30, 40, 50];

  it("returns min, median and max", () => {
    expect(percentile(data, 0)).toBe(10);
    expect(percentile(data, 50)).toBe(30);
    expect(percentile(data, 100)).toBe(50);
  });

  it("interpolates between ranks", () => {
    expect(percentile(data, 90)).toBeCloseTo(46);
  });

  it("handles empty and single-value input", () => {
    expect(percentile([], 50)).toBeNaN();
    expect(percentile([7], 99)).toBe(7);
  });
});

describe("chiSquarePValue", () => {
  it("matches the closed form for df = 2 (p = e^(-x/2))", () => {
    for (const x of [0.5, 2, 5.991, 10]) expect(chiSquarePValue(x, 2)).toBeCloseTo(Math.exp(-x / 2), 10);
  });

  it("matches textbook critical values", () => {
    expect(chiSquarePValue(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(6.635, 1)).toBeCloseTo(0.01, 3);
    expect(chiSquarePValue(11.07, 5)).toBeCloseTo(0.05, 3);
  });

  it("is 1 at zero", () => {
    expect(chiSquarePValue(0, 3)).toBe(1);
  });
});

describe("chiSquareTest", () => {
  it("passes a split that matches 34/33/33", () => {
    const { pValue, df } = chiSquareTest([3405, 3290, 3305], [34, 33, 33]);
    expect(df).toBe(2);
    expect(pValue).toBeGreaterThan(0.05);
  });

  it("flags a broken split (sample ratio mismatch)", () => {
    expect(chiSquareTest([5000, 2500, 2500], [34, 33, 33]).pValue).toBeLessThan(1e-6);
  });

  it("rejects mismatched inputs", () => {
    expect(() => chiSquareTest([1, 2], [1])).toThrow(RangeError);
  });
});
