// Sends simulated shoppers through the real app so the Flagsmith experiment gets traffic.
//
// Each shopper: opens the checkout (the server records the exposure and shows a variant),
// then behaves according to scripts/lib/shopper-model.ts — leaves, pays by UPI, or picks COD —
// and orders through POST /api/orders (the server sends the conversion events).
//
// Usage (after `npm run build`, with the experiment running):
//   npm run simulate -- --shoppers 3000
//   npm run simulate -- --shoppers 300 --dry-run   events go to a local counter, not Flagsmith
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { Flagsmith } from "@flagsmith/nodejs";
import { PRODUCTS } from "../src/lib/catalog";
import { toVariant, VARIANTS, type Variant } from "../src/lib/nudges";
import { decide, expectedPrepaidRate, seededRandom } from "./lib/shopper-model";

const { values: args } = parseArgs({
  options: {
    shoppers: { type: "string", default: "3000" },
    concurrency: { type: "string", default: "20" },
    seed: { type: "string", default: "20261126" },
    port: { type: "string", default: "3300" },
    "dry-run": { type: "boolean", default: false },
  },
});
const SHOPPERS = Number(args.shoppers);
const CONCURRENCY = Number(args.concurrency);
const DRY_RUN = args["dry-run"];
const BASE = `http://127.0.0.1:${args.port}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Refuse to send real traffic unless Flagsmith is actually serving the running experiment. */
async function assertExperimentLive() {
  const flagsmith = new Flagsmith({ environmentKey: process.env.FLAGSMITH_SERVER_KEY!.trim(), enableLocalEvaluation: true });
  try {
    for (let attempt = 1; attempt <= 12; attempt++) {
      const flag = (await flagsmith.getIdentityFlags("sim-probe-0001")).getFlag("checkout_nudge");
      const experiment = (flag as { experiment?: { id: number; name: string } }).experiment;
      if (experiment) {
        console.log(`Experiment live: "${experiment.name}" (id ${experiment.id})`);
        return;
      }
      if (attempt === 1) console.log("Waiting for Flagsmith to serve the running experiment…");
      await sleep(10_000);
      await flagsmith.updateEnvironment();
    }
    throw new Error("The experiment is not running in Flagsmith. Start it with `npm run experiment -- start`.");
  } finally {
    await flagsmith.close();
  }
}

async function main() {
  if (!existsSync(".next/BUILD_ID")) throw new Error("No production build found. Run `npm run build` first.");
  if (!DRY_RUN) await assertExperimentLive();

  // Dry run: a local stand-in for the events API so nothing reaches Flagsmith.
  const sinkEvents = new Map<string, number>();
  const sink = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      for (const e of JSON.parse(Buffer.concat(chunks).toString()).events as { event: string }[]) {
        sinkEvents.set(e.event, (sinkEvents.get(e.event) ?? 0) + 1);
      }
      res.writeHead(202).end();
    });
  });
  const sinkPort = DRY_RUN
    ? await new Promise<number>((r) => sink.listen(0, "127.0.0.1", () => r((sink.address() as AddressInfo).port)))
    : 0;

  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", args.port!], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      ...(DRY_RUN ? { FLAGSMITH_EVENTS_API_URL: `http://127.0.0.1:${sinkPort}/` } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (c: Buffer) => process.stderr.write(`[server] ${c}`));

  try {
    for (let waited = 0; ; waited += 250) {
      try {
        if ((await fetch(`${BASE}/`)).ok) break;
      } catch {}
      if (waited > 30_000) throw new Error("Server did not start within 30s");
      await sleep(250);
    }

    const rand = seededRandom(Number(args.seed));
    const runId = Date.now().toString(36);
    const tally = Object.fromEntries(VARIANTS.map((v) => [v, { shoppers: 0, orders: 0, upi: 0, failures: 0 }])) as Record<
      Variant,
      { shoppers: number; orders: number; upi: number; failures: number }
    >;
    let next = 0;
    let done = 0;
    console.log(`${DRY_RUN ? "DRY RUN · " : ""}Sending ${SHOPPERS} shoppers (concurrency ${CONCURRENCY}, seed ${args.seed})…`);

    const shopper = async () => {
      for (;;) {
        const n = next++;
        if (n >= SHOPPERS) return;
        const cookie = `pf_vid=sim-${runId}-${String(n).padStart(5, "0")}`;
        const product = PRODUCTS[Math.floor(rand() * PRODUCTS.length)];

        // 1. Open the checkout: exposure recorded server-side; read the variant the page shows.
        const html = await (await fetch(`${BASE}/checkout?product=${product.id}&debug=1`, { headers: { cookie } })).text();
        const variant = toVariant(/variant <code[^>]*>([a-z_]+)</.exec(html)?.[1]);
        tally[variant].shoppers++;

        // 2. Behave according to the model; 3. order.
        const { result } = decide(variant, rand);
        if (result !== "abandon") {
          const res = await fetch(`${BASE}/api/orders`, {
            method: "POST",
            headers: { cookie, "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id, qty: 1, paymentMethod: result }),
          });
          const order = (await res.json()) as { variant?: string };
          if (res.status !== 201 || order.variant !== variant) tally[variant].failures++;
          else {
            tally[variant].orders++;
            if (result === "upi") tally[variant].upi++;
          }
        }
        if (++done % 500 === 0) console.log(`  ${done}/${SHOPPERS}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, shopper));

    console.log("\nVariant         Shoppers  Orders  UPI orders  Prepaid rate  (model expects)  Failures");
    for (const v of VARIANTS) {
      const t = tally[v];
      const rate = t.shoppers ? (100 * t.upi) / t.shoppers : 0;
      console.log(
        `${v.padEnd(15)} ${String(t.shoppers).padStart(8)}  ${String(t.orders).padStart(6)}  ${String(t.upi).padStart(10)}  ` +
          `${rate.toFixed(1).padStart(11)}%  ${(100 * expectedPrepaidRate(v)).toFixed(1).padStart(14)}%  ${String(t.failures).padStart(8)}`,
      );
    }

    // The SDK flushes every 2 s; give it time to send the last batch before shutting down.
    console.log("\nLetting the server flush its last events…");
    await sleep(8_000);
    if (DRY_RUN) console.log(`Events received by the local counter: ${JSON.stringify(Object.fromEntries(sinkEvents))}`);
  } finally {
    server.kill();
    sink.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
