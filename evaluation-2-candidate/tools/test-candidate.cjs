const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Ajv = require("ajv");

const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "generated", "examples", "metric-catalog-2.0.0.json");
const SCHEMA = path.join(ROOT, "generated", "schemas", "metric-catalog-2.0.0.schema.json");
const LOCK = path.join(ROOT, "generated", "candidate-lock.json");
const EXPECTED = [
  "role-template-rework-rate",
  "role-template-trajectory-partial-cost",
  "role-model-task-outcome-rate",
  "operational-latency-ms",
  "trajectory-partial-cost",
  "task-cohort-comparison-eligibility",
  "delivery-stage-reach",
  "delivery-terminal-outcome-rate",
  "delivery-cycle-time-ms",
  "operational-token-usage",
  "operational-attributable-cost",
  "operational-usage-availability"
];
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const digest = value => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

test("candidate is a schema-valid exact 12-metric set", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
  const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
  assert.equal(catalog.version, "2.0.0");
  assert.equal(catalog.status, "REVIEW_CANDIDATE");
  assert.deepEqual(catalog.metrics.map(metric => metric.metric_id), EXPECTED);
  assert.ok(catalog.metrics.every(metric => metric.version === "2.0.0"));
});

test("removed metrics and their orphan inputs have no 2.0 alias", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const text = JSON.stringify(catalog);
  for (const forbidden of ["packet-rework-rate", "direct-evidence-basis-rate", "observation.packet-identity", "observation.fact-identity", "observation.fact-provenance"]) {
    assert.doesNotMatch(text, new RegExp(forbidden));
  }
});

test("cost metrics use recorded Usage compatibility without invented classifications", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const costIds = new Set(["role-template-trajectory-partial-cost", "trajectory-partial-cost", "operational-attributable-cost"]);
  for (const metric of catalog.metrics.filter(metric => costIds.has(metric.metric_id))) {
    const text = JSON.stringify(metric).toLowerCase();
    assert.deepEqual(metric.input_refs.includes("observation.reported-usage"), true);
    for (const required of ["usage kind", "usage unit", "usage source", "usage source_id"]) assert.match(text, new RegExp(required));
    for (const forbidden of ["cost basis", "project-attributable", "estimated", "unattributed"]) assert.doesNotMatch(text, new RegExp(forbidden));
    assert.match(text, /do not estimate, price or convert usage/);
  }
});

test("coverage remains per metric, exact and independent from minimum sample", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  assert.deepEqual(catalog.coverage_policy.result_fields, ["numerator", "denominator", "raw_ratio", "state", "alert"]);
  assert.match(catalog.coverage_policy.publication_rule, /always published/);
  assert.match(catalog.minimum_sample_policy, /coverage numerator, denominator, raw ratio, state and alert are still published/);
  assert.ok(catalog.metrics.every(metric => metric.coverage.denominator && metric.coverage.numerator));
});

test("candidate lock binds the generated semantic content but is not a publication", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  assert.equal(lock.catalog_sha256, digest(catalog));
  assert.equal(lock.status, "REVIEW_CANDIDATE");
  assert.equal(fs.existsSync(path.join(ROOT, "publication")), false);
});

test("published 1.0 artifacts remain byte-stable inputs", () => {
  const source = path.resolve(ROOT, "..", "evaluation");
  const publication = JSON.parse(fs.readFileSync(path.join(source, "publication", "publication-record-1.0.0.json"), "utf8"));
  assert.equal(publication.status, "PUBLISHED");
  assert.equal(publication.contract_revision, "agentops.evaluation.metric-catalog@1.0.0");
  assert.equal(JSON.parse(fs.readFileSync(path.join(source, "examples", "metric-catalog-1.0.0.json"), "utf8")).metrics.length, 14);
});

