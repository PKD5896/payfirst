// Creates everything the PayFirst experiment needs in Flagsmith, via the Admin API:
//   - multivariate flag `checkout_nudge` (control + upi_discount + free_delivery)
//   - metrics `prepaid_order_completed` (goal) and `checkout_completed` (guardrail)
//   - the experiment (created, NOT started)
// Safe to re-run: anything that already exists is reused.
// Run: npm run setup:experiment
import { admin, requireEnv, type Paginated } from "./lib/flagsmith-admin";

const FLAG = "checkout_nudge";
const VARIANTS = [
  { key: "upi_discount", value: "₹25 off on UPI", allocation: 33 },
  { key: "free_delivery", value: "Free delivery on UPI", allocation: 33 },
] as const; // control gets the remaining 34%

const METRICS = [
  { event: "prepaid_order_completed", description: "Order paid upfront by UPI", expected: "increase" },
  { event: "checkout_completed", description: "Any order placed (guardrail)", expected: "not_decrease" },
] as const;

const EXPERIMENT_NAME = "COD vs UPI-prepaid nudge";
const HYPOTHESIS =
  "Offering ₹25 off for paying by UPI will raise prepaid orders by at least 15% versus a neutral checkout, without reducing total checkouts.";

type Feature = { id: number; name: string };
type MvOption = { id: number; key: string | null; string_value: string | null };
type Metric = { id: number; name: string };
// The list endpoint returns `feature` as an object; the create endpoint returns its id.
type Experiment = { id: number; name: string; feature: number | { id: number }; status: string };
const featureIdOf = (e: Experiment) => (typeof e.feature === "number" ? e.feature : e.feature.id);

async function main() {
  const envKey = requireEnv("FLAGSMITH_ENVIRONMENT_KEY");

  const warehouses = await admin<{ status: string }[]>(`environments/${envKey}/warehouse-connections/`);
  if (warehouses.length === 0) {
    throw new Error("No warehouse connected. Enable it in Environment Settings › Warehouse first.");
  }
  const env = await admin<{ project: number; name: string }>(`environments/${envKey}/`);
  console.log(`Environment "${env.name}" in project ${env.project}; warehouse: ${warehouses[0].status}`);

  // 1. Flag
  const found = await admin<Paginated<Feature>>(`projects/${env.project}/features/?search=${FLAG}`);
  let feature = found.results.find((f) => f.name === FLAG);
  if (!feature) {
    feature = await admin<Feature>(`projects/${env.project}/features/`, {
      method: "POST",
      body: {
        name: FLAG,
        initial_value: "control",
        default_enabled: true,
        description: "Checkout nudge towards UPI prepaid. Variants: upi_discount, free_delivery.",
      },
    });
    console.log(`Created flag ${FLAG} (id ${feature.id})`);
  } else {
    console.log(`Flag ${FLAG} exists (id ${feature.id})`);
  }

  // 2. Variants (keys can only be set through the mv-options endpoint)
  const optionsPath = `projects/${env.project}/features/${feature.id}/mv-options/`;
  const existing = await admin<Paginated<MvOption> | MvOption[]>(optionsPath);
  const options = Array.isArray(existing) ? existing : existing.results;
  const optionIds: Record<string, number> = {};
  for (const v of VARIANTS) {
    let opt = options.find((o) => o.key === v.key);
    if (!opt) {
      opt = await admin<MvOption>(optionsPath, {
        method: "POST",
        body: { feature: feature.id, type: "unicode", string_value: v.value, key: v.key, default_percentage_allocation: 0 },
      });
      console.log(`Created variant ${v.key} (id ${opt.id})`);
    } else {
      console.log(`Variant ${v.key} exists (id ${opt.id})`);
    }
    optionIds[v.key] = opt.id;
  }

  // 3. Metrics
  const metricList = await admin<Paginated<Metric>>(`environments/${envKey}/experiment-metrics/`);
  const metricIds: Record<string, number> = {};
  for (const m of METRICS) {
    let metric = metricList.results.find((x) => x.name === m.event);
    if (!metric) {
      metric = await admin<Metric>(`environments/${envKey}/experiment-metrics/`, {
        method: "POST",
        body: {
          name: m.event,
          description: m.description,
          aggregation: "occurrence",
          direction: "up",
          definition: { version: 1, event: m.event },
        },
      });
      console.log(`Created metric ${m.event} (id ${metric.id})`);
    } else {
      console.log(`Metric ${m.event} exists (id ${metric.id})`);
    }
    metricIds[m.event] = metric.id;
  }

  // 4. Experiment (created, not started)
  const experiments = await admin<Paginated<Experiment>>(`environments/${envKey}/experiments/`);
  let experiment = experiments.results.find((e) => featureIdOf(e) === feature.id && e.status !== "completed");
  if (!experiment) {
    experiment = await admin<Experiment>(`environments/${envKey}/experiments/`, {
      method: "POST",
      body: {
        feature: feature.id,
        name: EXPERIMENT_NAME,
        hypothesis: HYPOTHESIS,
        metrics: METRICS.map((m) => ({ metric: metricIds[m.event], expected_direction: m.expected })),
        experiment_rollout: {
          enabled: true,
          rollout_percentage: 100,
          feature_state_value: { type: "string", value: "control" },
          multivariate_feature_state_values: VARIANTS.map((v) => ({
            multivariate_feature_option: optionIds[v.key],
            percentage_allocation: v.allocation,
          })),
        },
      },
    });
    console.log(`Created experiment "${experiment.name}" (id ${experiment.id})`);
  } else {
    console.log(`Experiment exists (id ${experiment.id}, status ${experiment.status})`);
  }

  console.log(`\nSet FLAGSMITH_EXPERIMENT_ID=${experiment.id} in .env.local`);
  console.log(`Dashboard: https://app.flagsmith.com/project/${env.project}/environment/${envKey}/experiments/${experiment.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
