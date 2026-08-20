const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");
const Ajv = require("ajv");

const ROOT = join(__dirname, "..");
const SCHEMA = join(ROOT, "schemas", "metric-catalog-0.1.0.schema.json");
const EXAMPLE = join(ROOT, "examples", "metric-catalog-0.1.0.json");
const CHECKER = join(ROOT, "tools", "check-catalog.cjs");

const EXPECTED_METRIC_IDS = [
  "model-role-utility-profile",
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
].sort();

function runChecker(path) {
  return spawnSync(process.execPath, [CHECKER, path], {
    cwd: ROOT,
    encoding: "utf8"
  });
}

test("draft-07 schema compiles in Ajv strict mode", () => {
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const ajv = new Ajv({ strict: true, allErrors: true });
  assert.doesNotThrow(() => ajv.compile(schema));
});

test("the normative example passes schema and semantic validation", () => {
  const result = runChecker(EXAMPLE);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: 15 metrics, unique IDs, resolved input refs, never-zero missing semantics/);
});

test("the example contains exactly the 15 issue #43 metric IDs", () => {
  const catalog = JSON.parse(readFileSync(EXAMPLE, "utf8"));
  assert.deepEqual(catalog.metrics.map(({ metric_id }) => metric_id).sort(), EXPECTED_METRIC_IDS);
});

for (const [fixture, mutate, expectedError] of [
  ["duplicate-metric-id", catalog => { catalog.metrics[1].metric_id = catalog.metrics[0].metric_id; }, /duplicate metric_id/],
  ["duplicate-input-id", catalog => { catalog.input_definitions[1].input_id = catalog.input_definitions[0].input_id; }, /duplicate input_id/],
  ["input-source-mismatch", catalog => { catalog.input_definitions[0].source_layer = "observation"; }, /input source mismatch/],
  ["unexpected-input-set", catalog => { catalog.input_definitions.push({ input_id: "evaluation.not-declared", source_layer: "evaluation", semantic_ref: "not declared", binding: "human-semantic-reference" }); }, /input set mismatch/],
  ["wrong-per-metric-input-set", catalog => { catalog.metrics[0].input_refs = ["projection.compatibility-eligibility"]; }, /input_refs mismatch for model-role-utility-profile/],
  ["missing-input-refs", catalog => { delete catalog.metrics[0].input_refs; }, /input_refs/],
  ["unresolved-input-ref", catalog => { catalog.metrics[0].input_refs = ["observation.not-declared"]; }, /unresolved input_ref/],
  ["zero-missing", catalog => { catalog.metrics[0].value_semantics.missing = "0"; }, /value_semantics\/missing|must match pattern/],
  ["unexpected-metric-set", catalog => { catalog.metrics[0].metric_id = "configuration-utility-profile"; }, /metric set mismatch/]
]) {
  test(`invalid fixture fails closed: ${fixture}`, () => {
    const catalog = JSON.parse(readFileSync(EXAMPLE, "utf8"));
    mutate(catalog);
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "evaluation-contract-"));
    const fixturePath = join(fixtureDirectory, `${fixture}.json`);
    writeFileSync(fixturePath, `${JSON.stringify(catalog, null, 2)}\n`);
    const result = runChecker(fixturePath);
    rmSync(fixtureDirectory, { recursive: true, force: true });
    assert.notEqual(result.status, 0, "invalid fixture unexpectedly passed");
    assert.match(`${result.stdout}\n${result.stderr}`, expectedError);
  });
}
