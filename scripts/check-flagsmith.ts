// Verifies the Flagsmith server-side key works and sends one real event,
// which also moves the managed warehouse from "Pending" to "Connected".
// Run: npm run check:flagsmith
import { Flagsmith } from "@flagsmith/nodejs";

async function main() {
  const serverKey = process.env.FLAGSMITH_SERVER_KEY;
  if (!serverKey?.startsWith("ser.")) {
    console.error("FLAGSMITH_SERVER_KEY is missing or is not a server-side key (ser.…). Check .env.local.");
    process.exit(1);
  }

  const flagsmith = new Flagsmith({
    environmentKey: serverKey,
    enableLocalEvaluation: true,
    enableEvents: true,
  });

  try {
    const flags = await flagsmith.getEnvironmentFlags();
    console.log(`Connected to Flagsmith. Features in this environment: ${flags.allFlags().length}`);

    flagsmith.trackEvent("setup_check", { identifier: "setup-check" });
    await flagsmith.flushEvents();
    console.log("Sent a 'setup_check' event. The warehouse should show Connected once it is processed.");
  } catch (err) {
    console.error("Flagsmith check failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await flagsmith.close();
  }
}

main();
