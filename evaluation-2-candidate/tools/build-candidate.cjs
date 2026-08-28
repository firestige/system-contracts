#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.resolve(ROOT, "..", "evaluation");
const GENERATED = path.join(ROOT, "generated");
const REMOVED = new Set(["packet-rework-rate", "direct-evidence-basis-rate"]);

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const digest = value => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

fs.rmSync(GENERATED, { recursive: true, force: true });
fs.mkdirSync(path.join(GENERATED, "schemas"), { recursive: true });
fs.mkdirSync(path.join(GENERATED, "examples"), { recursive: true });

const schema = readJson(path.join(SOURCE, "schemas", "metric-catalog-1.0.0.schema.json"));
schema.$id = "https://github.com/firestige/system-contracts/evaluation-2-candidate/generated/schemas/metric-catalog-2.0.0.schema.json";
schema.title = "Evaluation Metric Catalog 2.0.0 review candidate";
schema.properties.version.const = "2.0.0";
schema.properties.status.const = "REVIEW_CANDIDATE";
schema.properties.semantic_authority.const = "workflow-self-recursive/docs/contracts/evaluation/metric-catalog-2-candidate.md@metric-catalog-2-candidate";
schema.properties.metrics.minItems = 12;
schema.properties.metrics.maxItems = 12;
writeJson(path.join(GENERATED, "schemas", "metric-catalog-2.0.0.schema.json"), schema);

const catalog = readJson(path.join(SOURCE, "examples", "metric-catalog-1.0.0.json"));
catalog.version = "2.0.0";
catalog.status = "REVIEW_CANDIDATE";
catalog.semantic_authority = "workflow-self-recursive/docs/contracts/evaluation/metric-catalog-2-candidate.md@metric-catalog-2-candidate";
catalog.metrics = catalog.metrics.filter(metric => !REMOVED.has(metric.metric_id));
catalog.input_definitions = catalog.input_definitions.filter(input => ![
  "observation.packet-identity",
  "observation.fact-identity",
  "observation.fact-provenance"
].includes(input.input_id));
for (const input of catalog.input_definitions) {
  if (input.input_id === "observation.reported-cost") {
    input.input_id = "observation.reported-usage";
    input.semantic_ref = "Observation Catalog Usage → kind, unit, value, source and source_id";
  }
}
for (const metric of catalog.metrics) {
  metric.version = "2.0.0";
  metric.input_refs = metric.input_refs.map(ref => ref === "observation.reported-cost" ? "observation.reported-usage" : ref);
}

const COST_REVISIONS = {
  "role-template-trajectory-partial-cost": {
    evaluation_unit: "eligible terminal task trajectory in one event-time role-template cohort with linked reported money Usage",
    dimensions: ["role template", "task cohort", "usage kind", "usage unit", "usage source", "usage source_id"],
    filters: ["exact event-time assignment", "reported money Usage", "exact compatible Usage group"],
    calculation: "Sum recorded money Usage for covered task trajectories separately by exact kind, unit, source and source_id; publish coverage.",
    eligibility: ["task passes Metric Catalog 1.0 §6.2", "reported money Usage has exact kind, unit, source and source_id"],
    exclusions: ["incompatible Usage kind, unit, source or source_id"],
    coverage: {
      denominator: "tasks in the immutable defined-task snapshot with exact identity, time window, cohort and role-template scope",
      numerator: "denominator units with unique terminal-task outcome and exact reported money Usage compatibility coordinates available"
    }
  },
  "trajectory-partial-cost": {
    evaluation_unit: "Delivery trajectory with linked reported money Usage",
    dimensions: ["Delivery", "usage kind", "usage unit", "usage source", "usage source_id"],
    filters: ["exact Delivery linkage", "reported money Usage", "exact compatible Usage group"],
    calculation: "Sum recorded money Usage over covered Delivery trajectories separately by exact kind, unit, source and source_id; publish coverage.",
    eligibility: ["exact Delivery linkage", "reported money Usage has exact kind, unit, source and source_id"],
    exclusions: ["incompatible Usage kind, unit, source or source_id"],
    coverage: {
      denominator: "Delivery trajectories with exact identity, time window and cohort scope",
      numerator: "denominator units with exact reported money Usage compatibility coordinates available"
    }
  },
  "operational-attributable-cost": {
    evaluation_unit: "operational model call with linked reported money Usage",
    dimensions: ["provider", "model", "role", "runtime", "usage kind", "usage unit", "usage source", "usage source_id"],
    filters: ["native Trace/Span call linkage", "reported money Usage", "exact compatible Usage group"],
    calculation: "Sum recorded call-linked money Usage separately by exact kind, unit, source and source_id within one provider/model/role/runtime cohort; publish coverage.",
    eligibility: ["native Trace/Span context binds the Usage to the exact model call", "reported money Usage has exact kind, unit, source and source_id"],
    exclusions: ["missing exact call linkage", "incompatible Usage kind, unit, source or source_id", "incomplete provider/model/role/runtime attribution"],
    coverage: {
      denominator: "model calls with exact identity, time window and cohort scope",
      numerator: "denominator units with native Usage-to-call binding, reported money Usage compatibility coordinates and complete provider/model/role/runtime attribution tuple"
    }
  }
};
for (const metric of catalog.metrics) {
  if (!COST_REVISIONS[metric.metric_id]) continue;
  Object.assign(metric, COST_REVISIONS[metric.metric_id]);
  metric.value_semantics.unit = "reported money unit";
  metric.value_semantics.missing = "N/A when no compatible reported money Usage exists";
  metric.uncertainty = ["reported value is the partial sum of covered compatible Usage"];
  metric.forbidden_inference = ["do not label as total cost", "do not estimate, price or convert Usage"];
}

writeJson(path.join(GENERATED, "examples", "metric-catalog-2.0.0.json"), catalog);
writeJson(path.join(GENERATED, "candidate-lock.json"), {
  coordinate: "agentops.evaluation.metric-catalog@2.0.0",
  status: "REVIEW_CANDIDATE",
  catalog_sha256: digest(catalog),
  metric_ids: catalog.metrics.map(metric => metric.metric_id)
});
console.log(`generated 12-metric review candidate sha256:${digest(catalog)}`);

