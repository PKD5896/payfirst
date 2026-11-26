// Small statistics helpers shared by the load test and the agent.

/** Linear-interpolated percentile (p in 0..100) of an ascending-sorted array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = (Math.min(Math.max(p, 0), 100) / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

// Lanczos approximation of ln Γ(z), z > 0.
function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized upper incomplete gamma Q(s, x) = Γ(s, x) / Γ(s). */
function gammaQ(s: number, x: number): number {
  if (x <= 0) return 1;
  if (x < s + 1) {
    // Series for P(s, x), then Q = 1 - P.
    let sum = 1 / s;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (s + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + s * Math.log(x) - lnGamma(s));
  }
  // Continued fraction (modified Lentz) for Q(s, x).
  const tiny = 1e-300;
  let b = x + 1 - s;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h;
}

/** Survival function of the chi-square distribution: P(X ≥ x) with `df` degrees of freedom. */
export function chiSquarePValue(x: number, df: number): number {
  return gammaQ(df / 2, x / 2);
}

/**
 * Chi-square goodness-of-fit test, e.g. a sample-ratio-mismatch check of observed variant
 * counts against the configured split. A tiny p-value means the split is broken.
 */
export function chiSquareTest(observed: readonly number[], expectedShares: readonly number[]) {
  if (observed.length !== expectedShares.length || observed.length < 2) {
    throw new RangeError("observed and expectedShares must have the same length (≥ 2)");
  }
  const total = observed.reduce((a, b) => a + b, 0);
  const shareSum = expectedShares.reduce((a, b) => a + b, 0);
  const statistic = observed.reduce((acc, o, i) => {
    const e = (expectedShares[i] / shareSum) * total;
    return acc + (o - e) ** 2 / e;
  }, 0);
  const df = observed.length - 1;
  return { statistic, df, pValue: chiSquarePValue(statistic, df) };
}
