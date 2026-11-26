# PayFirst — Design

A/B testing UPI-prepaid nudges at checkout with Flagsmith Experimentation, to reduce costly COD returns (RTO) in Indian e-commerce.

Hackathon: WeMakeDevs × Flagsmith Experimentation Hackathon, Track 01 "Test Something Real" (Nov 26–29, 2026).

---

## 1. Problem

Most Indian online orders are still Cash on Delivery, and COD orders fail at the door far more often than prepaid ones. Every failed order is shipped back to the seller (RTO), who pays logistics twice and has stock stuck in transit.

| Fact | Figure | Source |
|---|---|---|
| Prepaid share of orders, 2025 | 41% overall (metro 46%, Tier-2 40%, Tier-3 34.5%) | ClickPost, 635M orders, via Social Samosa, Dec 2025 |
| Undelivered rate, COD vs prepaid | 22.3% vs 2.7% (FY25) | Meesho prospectus, 2025 |
| COD RTO rate range across sources | 22–38% | Meesho, ClickPost, Razorpay |
| Estimated cost per RTO | ~₹350 on a ₹1,200 order (model estimate) | ClickPost, 2026 |

Brands try nudges (discounts, free delivery) to push buyers to UPI, but published case studies change several things at once, so nobody knows which single nudge works. A controlled A/B test answers that.

We deliberately do **not** test a COD fee: in Oct 2025 the Consumer Affairs Ministry called extra COD charges a "dark pattern" and the CCPA is investigating. All variants are rewards, not penalties.

---

## 2. User flow

```
Shopper → Store (/) → Checkout (/checkout) → picks UPI or COD → Order placed (/order/[id])
                         │                                  │
          server asks Flagsmith which variant ──┐           └─ server sends events to Flagsmith:
          (records an exposure)                 │              • checkout_completed      (every order)
                                                ▼              • prepaid_order_completed (UPI only)
                 control: neutral   upi_discount: "₹25 off on UPI"   free_delivery: "Free delivery on UPI"
```

- **Store:** small Indian ethnic-wear shop, 4 products.
- **Identity:** anonymous visitor ID in a cookie (set in middleware) so a shopper always sees the same variant.
- **Server-side evaluation:** the checkout page gets the variant on the server — no flicker, only the server-side key is used.
- **Payment:** UPI is a **mock** screen (no real payments). COD just confirms the order.
- **Delivery fee:** ₹40 standard.

---

## 3. Flagsmith setup

| Item | Value |
|---|---|
| Flag | `checkout_nudge` (multivariate). Control value `control` |
| Variant keys | `upi_discount` (₹25 off on UPI), `free_delivery` (₹40 delivery waived on UPI) |
| Split | 34 / 33 / 33 |
| Goal metric | `prepaid_order_completed` — occurrence, expected direction **increase** |
| Guardrail metric | `checkout_completed` — occurrence, expected direction **not_decrease** |
| Hypothesis | A ₹25 UPI discount raises prepaid orders by ≥15% vs control without reducing total checkouts |

Environment: Development, Flagsmith-managed warehouse.

---

## 4. Traffic simulator (`npm run simulate`)

- ~3,000 simulated shoppers driven **through the app's own HTTP endpoints**, so the experiment exercises the same code path real shoppers use.
- Shopper mix across metro / Tier-2 / Tier-3, with baseline prepaid rates anchored to the ClickPost tier figures above.
- Per-variant lift and drop-off probabilities are **assumptions**, stated in the script and README.
- Events flushed every ~250 shoppers to avoid SDK buffer drops.

> **Transparency:** simulated results reflect the assumptions in the simulator. The point is to demonstrate the method end to end; the app works unchanged with real traffic.

---

## 5. Agent (`npm run agent`, CLI)

1. **Fetch** experiment results via the Flagsmith Admin API (refresh, then poll).
2. **Analyse** per-variant conversion rates; compute the probability each variant is best of all three (Flagsmith reports each treatment vs control only).
3. **Safety checks** — refuses to recommend if: sample too small, sample-ratio mismatch, guardrail breached, or chance to win < 95%.
4. **Business impact** — net ₹ = RTO cost avoided − incentive cost (discount or waived delivery), at a configurable orders/day.
5. **Explain** in English and Hindi via the Gemini API (free tier); falls back to templates without a key.
6. **Ship** — recommends the winner, asks `Ship it? (y/n)`; on "y" completes the experiment with the winner rolled out to 100%.

---

## 6. Project structure

```
src/app/               page.tsx (store) · checkout/ · order/[id]/ · api/orders/route.ts · reset-shopper/
src/components/        ProductTile (Devanagari product tiles)
src/lib/               flagsmith.ts (server client, local evaluation, resilience) · nudges.ts (variant → offer)
src/proxy.ts           anonymous visitor ID (Next.js 16 "proxy", formerly middleware)
src/instrumentation.ts loads the Flagsmith environment at server start
scripts/               setup-experiment.ts · load-test.ts · simulate.ts · agent/
docs/                  DESIGN.md · PERFORMANCE.md
.env.example           variable names only, never real keys
```

Environment variables (in `.env.local`, never committed): Flagsmith environment key, server-side key, Admin API key, experiment ID, Gemini API key.

---

## 7. Demo video (~2.5 min)

1. Problem + stats (20s)
2. The three checkout variants (30s)
3. Flagsmith setup — flag, metrics, experiment (20s)
4. Simulator running (20s)
5. Results in Flagsmith (20s)
6. Agent: explanation (English/Hindi), ₹ impact, human approval, winner shipped (40s)
7. Close (20s)

---

## 8. Schedule (IST)

| Day | Goal |
|---|---|
| Nov 26 | First commit; Flagsmith SDKs; flag, metrics, experiment; store + checkout with 3 variants; events |
| Nov 27 | Simulator; start experiment; run traffic; first results — **core done** |
| Nov 28 | Agent |
| Nov 29 | README with sources, demo video, **submit by 4 PM** (deadline 8 PM) |
