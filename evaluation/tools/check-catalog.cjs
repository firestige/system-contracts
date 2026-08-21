#!/usr/bin/env node

const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { resolve, join } = require("node:path");
const Ajv = require("ajv");

const ROOT = join(__dirname, "..");
const SCHEMA_PATH = join(ROOT, "schemas", "metric-catalog-1.0.0.schema.json");
const EXPECTED_METRIC_IDS = new Set([
  "role-template-rework-rate",
  "role-template-trajectory-partial-cost",
  "role-model-task-outcome-rate",
  "packet-rework-rate",
  "operational-latency-ms",
  "trajectory-partial-cost",
  "task-cohort-comparison-eligibility",
  "delivery-stage-reach",
  "delivery-terminal-outcome-rate",
  "delivery-cycle-time-ms",
  "operational-token-usage",
  "operational-attributable-cost",
  "operational-usage-availability",
  "direct-evidence-basis-rate"
]);
const EXPECTED_INPUT_REFS = {
  "role-template-rework-rate": ["evaluation.defined-task-snapshot", "evaluation.event-time-role-template", "evaluation.unique-terminal-task-outcome", "observation.repair-link", "projection.compatibility-eligibility"],
  "role-template-trajectory-partial-cost": ["evaluation.defined-task-snapshot", "evaluation.event-time-role-template", "evaluation.unique-terminal-task-outcome", "observation.reported-cost", "projection.compatibility-eligibility"],
  "role-model-task-outcome-rate": ["evaluation.unique-terminal-task-outcome", "observation.model-role-attribution-tuple", "projection.compatibility-eligibility"],
  "packet-rework-rate": ["observation.packet-identity", "observation.repair-link", "projection.compatibility-eligibility"],
  "operational-latency-ms": ["observation.model-call-span-duration", "observation.model-role-attribution-tuple", "projection.compatibility-eligibility"],
  "trajectory-partial-cost": ["observation.delivery-identity", "observation.reported-cost", "projection.compatibility-eligibility"],
  "task-cohort-comparison-eligibility": ["evaluation.defined-task-snapshot", "evaluation.unique-terminal-task-outcome", "projection.compatibility-eligibility"],
  "delivery-stage-reach": ["observation.delivery-identity", "observation.delivery-stage-reached-c56", "projection.compatibility-eligibility"],
  "delivery-terminal-outcome-rate": ["observation.delivery-identity", "observation.delivery-outcome", "projection.compatibility-eligibility"],
  "delivery-cycle-time-ms": ["observation.delivery-identity", "observation.delivery-elapsed-time-c55", "projection.compatibility-eligibility"],
  "operational-token-usage": ["observation.standard-token-usage", "observation.model-role-attribution-tuple", "projection.compatibility-eligibility"],
  "operational-attributable-cost": ["observation.reported-cost", "observation.model-role-attribution-tuple", "projection.compatibility-eligibility"],
  "operational-usage-availability": ["observation.model-call-identity", "observation.usage-source", "observation.model-role-attribution-tuple", "projection.compatibility-eligibility"],
  "direct-evidence-basis-rate": ["observation.fact-identity", "observation.fact-provenance", "projection.compatibility-eligibility"]
};
const EXPECTED_INPUT_IDS = new Set(Object.values(EXPECTED_INPUT_REFS).flat());
const EXPECTED_CATALOG_DIGEST = "5d7fb2b8416ab4fa08e7511287e9a34dc628fb1c99ff63271054a0117a7710a5";
const EXPECTED_OBSERVATION_PUBLICATION = join(ROOT, "..", "observation", "publication", "publication-record-1.0.0.json");
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const canonicalDigest = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

function fail(messages) {
  for (const message of messages) console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

const target = process.argv[2];
if (!target) {
  fail(["usage: node tools/check-catalog.cjs <catalog.json>"]);
} else {
  let catalog;
  let schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    catalog = JSON.parse(readFileSync(resolve(target), "utf8"));
  } catch (error) {
    fail([error.message]);
  }

  if (catalog && schema) {
    const ajv = new Ajv({ strict: true, allErrors: true });
    const validate = ajv.compile(schema);
    const errors = [];

    if (!validate(catalog)) {
      errors.push(...validate.errors.map(error => `${error.instancePath || "/"} ${error.message}`));
    }

    if (canonicalDigest(catalog) !== EXPECTED_CATALOG_DIGEST) {
      errors.push("catalog semantic digest mismatch");
    }

    try {
      const observation = JSON.parse(readFileSync(EXPECTED_OBSERVATION_PUBLICATION, "utf8"));
      const dependency = catalog.dependencies?.[0];
      if (observation.status !== "PUBLISHED" || observation.published !== true
        || dependency?.coordinate !== observation.release_binding?.coordinate
        || dependency?.semantic_revision !== observation.release_binding?.superproject?.revision
        || dependency?.machine_revision !== observation.release_binding?.machine_package?.revision
        || dependency?.publication_sha256 !== createHash("sha256").update(readFileSync(EXPECTED_OBSERVATION_PUBLICATION)).digest("hex")) {
        errors.push("Observation dependency does not resolve to the exact published 1.0.0 binding");
      }
    } catch (error) {
      errors.push(`Observation dependency is not resolvable: ${error.message}`);
    }

    if (Array.isArray(catalog.input_definitions) && Array.isArray(catalog.metrics)) {
      const inputIds = catalog.input_definitions.map(({ input_id }) => input_id);
      for (const input of catalog.input_definitions) {
        const declaredLayer = typeof input.input_id === "string" ? input.input_id.split(".", 1)[0] : undefined;
        if (declaredLayer && input.source_layer && declaredLayer !== input.source_layer) {
          errors.push(`input source mismatch for ${input.input_id}: prefix=${declaredLayer}, source_layer=${input.source_layer}`);
        }
      }
      for (const inputId of new Set(inputIds)) {
        if (inputIds.filter(candidate => candidate === inputId).length > 1) {
          errors.push(`duplicate input_id: ${inputId}`);
        }
      }

      const actualInputSet = new Set(inputIds);
      const missingInputs = [...EXPECTED_INPUT_IDS].filter(id => !actualInputSet.has(id));
      const unexpectedInputs = [...actualInputSet].filter(id => !EXPECTED_INPUT_IDS.has(id));
      if (missingInputs.length || unexpectedInputs.length) {
        errors.push(`input set mismatch; missing=[${missingInputs.join(", ")}], unexpected=[${unexpectedInputs.join(", ")}]`);
      }

      const metricIds = catalog.metrics.map(({ metric_id }) => metric_id);
      for (const metricId of new Set(metricIds)) {
        if (metricIds.filter(candidate => candidate === metricId).length > 1) {
          errors.push(`duplicate metric_id: ${metricId}`);
        }
      }

      const actualSet = new Set(metricIds);
      const missing = [...EXPECTED_METRIC_IDS].filter(id => !actualSet.has(id));
      const unexpected = [...actualSet].filter(id => !EXPECTED_METRIC_IDS.has(id));
      if (missing.length || unexpected.length) {
        errors.push(`metric set mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`);
      }

      const declaredInputs = new Set(inputIds);
      for (const metric of catalog.metrics) {
        if (!Array.isArray(metric.input_refs)) continue;
        const expectedRefs = EXPECTED_INPUT_REFS[metric.metric_id];
        if (expectedRefs && JSON.stringify([...metric.input_refs].sort()) !== JSON.stringify([...expectedRefs].sort())) {
          errors.push(`input_refs mismatch for ${metric.metric_id}`);
        }
        for (const inputRef of metric.input_refs) {
          if (!declaredInputs.has(inputRef)) {
            errors.push(`unresolved input_ref for ${metric.metric_id}: ${inputRef}`);
          }
        }
      }
    }

    if (errors.length) {
      fail(errors);
    } else {
      console.log("PASS: 14 metrics, exact semantic binding, coverage policy, and resolved input refs");
    }
  }
}
