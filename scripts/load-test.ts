// Load test for the PayFirst backend against the production build.
//
// Starts a local stand-in for the Flagsmith events API (so load tests never flood the real
// account, and so every event can be counted), boots `next start` pointed at it, fires
// concurrent orders from unique shoppers, then reports throughput, latency, errors, the
// variant split (sample-ratio check) and whether any events were lost.
//
// Usage (after `npm run build`):
//   npm run loadtest -- --orders 10000 --concurrency 100
//   npm run loadtest -- --scenario events-down      events API returns 503
//   npm run loadtest -- --scenario events-recover   events API returns 503 for 6s, then recovers
//   npm run loadtest -- --scenario flagsmith-down   Flagsmith API refuses connections
//   npm run loadtest -- --scenario flagsmith-hang   Flagsmith API accepts but never answers
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import { chiSquareTest, percentile } from "./lib/stats";

const { values: args } = parseArgs({
  options: {
    orders: { type: "string", default: "5000" },
    concurrency: { type: "string", default: "100" },
    scenario: { type: "string", default: "normal" },
    port: { type: "string", default: "3100" },
    "upi-share": { type: "string", default: "0.6" },
  },
});
const ORDERS = Number(args.orders);
const CONCURRENCY = Number(args.concurrency);
const SCENARIO = args.scenario as "normal" | "events-down" | "events-recover" | "flagsmith-down" | "flagsmith-hang";
const PORT = Number(args.port);
const UPI_SHARE = Number(args["upi-share"]);
const BASE = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = 30_000;

if (!["normal", "events-down", "events-recover", "flagsmith-down", "flagsmith-hang"].includes(SCENARIO)) {
  throw new Error(`Unknown scenario ${SCENARIO}`);
}
if (!existsSync(".next/BUILD_ID")) throw new Error("No production build found. Run `npm run build` first.");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

// --- Stand-in Flagsmith events API -------------------------------------------------------
const eventCounts = new Map<string, number>();
let eventsDownUntil = SCENARIO === "events-down" ? Number.POSITIVE_INFINITY : 0;
let batches = 0;
const sink = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    if (Date.now() < eventsDownUntil) {
      res.writeHead(503).end();
      return;
    }
    try {
      const { events } = JSON.parse(Buffer.concat(chunks).toString()) as { events: { event: string }[] };
      batches++;
      for (const e of events) eventCounts.set(e.event, (eventCounts.get(e.event) ?? 0) + 1);
      res.writeHead(202).end();
    } catch {
      res.writeHead(400).end();
    }
  });
});

// Accepts connections and never answers: the worst kind of outage.
const hangingApi = http.createServer(() => {});

function memoryMb(pid: number | undefined): number | null {
  if (!pid || process.platform !== "win32") return null;
  try {
    const row = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
    const kb = Number(row.split('","').pop()?.replace(/[^\d]/g, ""));
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

async function main() {
  const sinkPort = await listen(sink);
  const hangPort = await listen(hangingApi);
  const apiUrl =
    SCENARIO === "flagsmith-down"
      ? "http://127.0.0.1:9/api/v1/" // nothing listens on port 9: connection refused
      : SCENARIO === "flagsmith-hang"
        ? `http://127.0.0.1:${hangPort}/api/v1/`
        : undefined;

  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      FLAGSMITH_EVENTS_API_URL: `http://127.0.0.1:${sinkPort}/`,
      ...(apiUrl ? { FLAGSMITH_API_URL: apiUrl } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let warnings = 0;
  const logTail: string[] = [];
  const onLog = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      if (/warn|error|fail|unavailable/i.test(line)) warnings++;
      logTail.push(line);
      if (logTail.length > 8) logTail.shift();
    }
  };
  server.stdout.on("data", onLog);
  server.stderr.on("data", onLog);

  try {
    // Wait until the server answers.
    const bootStart = Date.now();
    for (;;) {
      try {
        if ((await fetch(`${BASE}/`)).ok) break;
      } catch {}
      if (Date.now() - bootStart > 30_000) throw new Error("Server did not start within 30s");
      await sleep(250);
    }
    const memBefore = memoryMb(server.pid);

    console.log(`Scenario: ${SCENARIO} · ${ORDERS} orders · concurrency ${CONCURRENCY} · UPI share ${UPI_SHARE}`);
    const runId = Date.now().toString(36);
    const latencies: number[] = [];
    const statuses = new Map<string, number>();
    const variants = new Map<string, number>();
    let upiOk = 0;
    let ok = 0;
    let next = 0;

    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= ORDERS) return;
        const paymentMethod = Math.random() < UPI_SHARE ? "upi" : "cod";
        const t0 = performance.now();
        let status: string;
        try {
          const res = await fetch(`${BASE}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: `pf_vid=load-${runId}-${i}` },
            body: JSON.stringify({ productId: "cotton-kurta", qty: 1, paymentMethod }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          status = String(res.status);
          const body = (await res.json()) as { variant?: string };
          if (res.status === 201) {
            ok++;
            if (paymentMethod === "upi") upiOk++;
            variants.set(body.variant ?? "?", (variants.get(body.variant ?? "?") ?? 0) + 1);
          }
        } catch (err) {
          status = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network-error";
        }
        latencies.push(performance.now() - t0);
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
      }
    };

    if (SCENARIO === "events-recover") eventsDownUntil = Date.now() + 6_000;
    const t0 = performance.now();
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const seconds = (performance.now() - t0) / 1000;
    const memAfter = memoryMb(server.pid);

    // Let the SDK flush (every 2s) until the counts stop changing.
    let last = -1;
    let stableFor = 0;
    for (let waited = 0; waited < 30_000 && stableFor < 4_000; waited += 1_000) {
      await sleep(1_000);
      const total = [...eventCounts.values()].reduce((a, b) => a + b, 0);
      stableFor = total === last ? stableFor + 1_000 : 0;
      last = total;
    }

    latencies.sort((a, b) => a - b);
    const fmt = (ms: number) => `${ms.toFixed(1)} ms`;
    console.log(`\nThroughput  ${(ORDERS / seconds).toFixed(0)} req/s over ${seconds.toFixed(1)} s`);
    console.log(
      `Latency     p50 ${fmt(percentile(latencies, 50))} · p95 ${fmt(percentile(latencies, 95))} · ` +
        `p99 ${fmt(percentile(latencies, 99))} · max ${fmt(latencies[latencies.length - 1])}`,
    );
    console.log(`Statuses    ${JSON.stringify(Object.fromEntries(statuses))}`);

    const split = ["control", "upi_discount", "free_delivery"].map((v) => variants.get(v) ?? 0);
    const srm = ok > 0 ? chiSquareTest(split, [34, 33, 33]) : null;
    console.log(
      `Variants    control ${split[0]} · upi_discount ${split[1]} · free_delivery ${split[2]}` +
        (srm ? ` · SRM p=${srm.pValue.toPrecision(3)} vs 34/33/33` : ""),
    );

    const got = (name: string) => eventCounts.get(name) ?? 0;
    const check = (name: string, expected: number) =>
      `${name} ${got(name)}/${expected}${got(name) === expected ? " ✓" : " ✗ LOST " + (expected - got(name))}`;
    console.log(`Events      ${check("checkout_completed", ok)} · ${check("prepaid_order_completed", upiOk)}`);
    console.log(`            $flag_exposure ${got("$flag_exposure")} · batches ${batches}`);
    if (memBefore !== null) console.log(`Memory      server ${memBefore} MB → ${memAfter} MB`);
    console.log(`Server log  ${warnings} warning/error lines${warnings ? "; last lines:\n  " + logTail.join("\n  ") : ""}`);
  } finally {
    server.kill();
    sink.close();
    hangingApi.closeAllConnections();
    hangingApi.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
