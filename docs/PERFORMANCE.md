# Performance & resilience

How the PayFirst backend behaves under heavy traffic and when Flagsmith misbehaves, measured with the included load-test harness.

```bash
npm run build
npm run loadtest -- --orders 10000 --concurrency 100          # normal traffic
npm run loadtest -- --scenario flagsmith-hang                 # Flagsmith accepts connections, never answers
npm run loadtest -- --scenario flagsmith-down                 # Flagsmith refuses connections
npm run loadtest -- --scenario events-recover                 # events API returns 503 for 6s, then recovers
npm run loadtest -- --scenario events-down                    # events API returns 503 throughout
```

The harness boots the production server, replaces the Flagsmith **events** API with a local counter (so load tests never flood the real account, and every event can be checked), and fires orders from unique shoppers. It reports throughput, latency percentiles, status codes, the variant split with a sample-ratio-mismatch (SRM) test, and whether any events were lost.

Measured on an 8-core Windows laptop, load generator on the same machine, single `next start` process.

## Results

| Scenario | Orders × concurrency | Throughput | Latency p50 / p99 | Errors | Events delivered |
|---|---|---|---|---|---|
| Normal | 3,000 × 10 | 644 req/s | **14.6 / 33.6 ms** | 0 | 100% |
| Normal | 10,000 × 100 | 521 req/s | 184 / 373 ms | 0 | 100% |
| Sustained | 30,000 × 100 | 542 req/s | 168 / 468 ms | 0 | 100% (48,043) |
| Spike | 10,000 × 500 | 480 req/s | 1,017 / 1,419 ms | 0 | 100% |
| Flagsmith hangs | 2,000 × 50 | 441 req/s | 109 / 201 ms | 0 | 100% |
| Flagsmith refuses connections | 2,000 × 50 | 468 req/s | 99 / 239 ms | 0 | 100% |
| Events API down for 6s, then back | 5,000 × 50 | 545 req/s | 90 / 179 ms | 0 | 100% (after recovery) |
| Events API down throughout | 5,000 × 50 | 474 req/s | 103 / 182 ms | 0 | held in memory for retry (up to 20,000) |

The variant split stayed consistent with the configured 34/33/33 in every normal run (SRM p between 0.12 and 0.89).

Latency at high concurrency is queueing: a single Next.js process on this machine tops out at roughly 500–650 req/s even for an empty route. Scaling beyond that means more instances, not code changes.

## What was changed, and why (before → after)

| Problem found | Fix | Effect |
|---|---|---|
| Flagsmith hanging made every checkout wait for SDK timeouts and retries | 500 ms evaluation budget, then the control checkout | p50 **21.7 s → 109 ms**, timeouts **50% → 0%** |
| Flagsmith refusing connections retried on every request and wrote 3 log lines per request | Circuit breaker: after a failure, serve control for 5 s without calling the SDK; log once | p50 **3.1 s → 99 ms**, log lines **6,002 → 1** |
| The first shoppers after a restart waited ~650 ms for the environment to load | Load it at server start (`src/instrumentation.ts`, capped at 3 s so an outage can't block startup) | No cold-start penalty for shoppers |
| The shopper-ID proxy also ran on API calls, which validate the cookie themselves | Proxy excludes `/api/` | +44% throughput on the order route in isolation |
| The order API recorded a second exposure for every order | Evaluate without an exposure (the checkout page records it) | Fewer events per order |
| The in-memory order store could grow without limit | Capped at 5,000 orders, oldest evicted | Memory plateaus (~300–350 MB under sustained load) |
| Oversized request bodies were parsed in full | 1 KB limit, `413` before parsing | Cheap rejection of junk traffic |

Flagsmith itself is not a bottleneck: local evaluation costs ~0.025 ms per call and tracking an event ~0.001 ms.

Once the environment has loaded, flags keep evaluating from the cached copy even if Flagsmith becomes unreachable, so an outage after start-up has no effect on shoppers.
