// Small CLI for the PayFirst experiment via the Flagsmith Admin API.
//   npm run experiment -- status     current status
//   npm run experiment -- start      start the experiment (locks the flag)
//   npm run experiment -- results    refresh (max once per 5 min) and print raw results
import { admin, requireEnv } from "./lib/flagsmith-admin";

type Experiment = { id: number; name: string; status: string; started_at: string | null };

async function main() {
  const envKey = requireEnv("FLAGSMITH_ENVIRONMENT_KEY");
  const id = requireEnv("FLAGSMITH_EXPERIMENT_ID");
  const base = `environments/${envKey}/experiments/${id}`;
  const command = process.argv[2] ?? "status";

  if (command === "status") {
    const e = await admin<Experiment>(`${base}/`);
    console.log(`${e.name} (id ${e.id}): ${e.status}${e.started_at ? `, started ${e.started_at}` : ""}`);
  } else if (command === "start") {
    const before = await admin<Experiment>(`${base}/`);
    if (before.status === "running") {
      console.log(`Already running since ${before.started_at}`);
      return;
    }
    await admin(`${base}/start/`, { method: "POST" });
    const after = await admin<Experiment>(`${base}/`);
    console.log(`${after.name}: ${before.status} → ${after.status} at ${after.started_at}`);
    if (after.status !== "running") process.exitCode = 1;
  } else if (command === "results") {
    try {
      await admin(`${base}/results/refresh/`, { method: "POST" });
      console.log("Refresh requested; results are computed asynchronously.");
    } catch (err) {
      console.log(`Refresh not requested: ${err instanceof Error ? err.message.slice(0, 160) : err}`);
    }
    console.log(JSON.stringify(await admin(`${base}/results/`), null, 2));
  } else {
    console.error(`Unknown command "${command}". Use status, start or results.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
