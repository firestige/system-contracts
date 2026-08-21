const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, relative } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");
const Ajv = require("ajv");

const ROOT = join(__dirname, "..");
const SCHEMA = join(ROOT, "schemas", "metric-catalog-1.0.0.schema.json");
const EXAMPLE = join(ROOT, "examples", "metric-catalog-1.0.0.json");
const FIXTURES = join(ROOT, "fixtures", "cases-1.0.0.json");
const CHECKER = join(ROOT, "tools", "check-catalog.cjs");
const { evaluateCoverage } = require("./coverage-policy.cjs");

const EXPECTED_METRIC_IDS = [
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
  const ajv = new Ajv({ strict: true, allErrors: true });
  for (const path of [SCHEMA, join(ROOT, "schemas", "fixture-cases-1.0.0.schema.json"), join(ROOT, "schemas", "publication-record-1.0.0.schema.json")]) {
    assert.doesNotThrow(() => ajv.compile(JSON.parse(readFileSync(path, "utf8"))));
  }
});

test("the normative example passes schema and semantic validation", () => {
  const result = runChecker(EXAMPLE);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: 14 metrics, exact semantic binding, coverage policy, and resolved input refs/);
});

test("the example contains exactly the 14 owner-approved metric IDs without Question Catalog or state profile surface", () => {
  const catalog = JSON.parse(readFileSync(EXAMPLE, "utf8"));
  assert.equal(catalog.version, "1.0.0");
  assert.ok(catalog.metrics.every(metric => metric.version === "1.0.0"));
  assert.ok(catalog.metrics.every(metric => !("question_refs" in metric)));
  assert.ok(catalog.metrics.every(metric => metric.value_semantics.kind !== "state"));
  assert.deepEqual(catalog.metrics.map(({ metric_id }) => metric_id).sort(), EXPECTED_METRIC_IDS);
});

test("coverage is always reported and LOW_COVERAGE uses exact cross multiplication", () => {
  const catalog = JSON.parse(readFileSync(EXAMPLE, "utf8"));
  assert.equal(catalog.minimum_sample_policy, "below minimum_sample the metric value is not published; coverage numerator, denominator, raw ratio, state and alert are still published");
  assert.deepEqual(catalog.coverage_policy, {
    result_fields: ["numerator", "denominator", "raw_ratio", "state", "alert"],
    states: ["NO_POPULATION", "NO_COVERAGE", "PARTIAL", "FULL"],
    default_alert_threshold: 0.1,
    allowed_alert_thresholds: { minimum: 0, maximum_exclusive: 1, multiple_of: 0.01 },
    low_coverage_rule: "threshold = 0 disables LOW_COVERAGE; otherwise denominator > 0 and 100 * numerator < threshold_hundredths * denominator",
    publication_rule: "coverage is always published and never gates publication or rewrites a computable metric value"
  });
  assert.ok(catalog.metrics.every(metric => metric.coverage && metric.coverage.denominator && metric.coverage.numerator));
  assert.ok(catalog.metrics.every(metric => !metric.exclusions.includes("insufficient coverage")));
  assert.deepEqual(evaluateCoverage(0, 0), { numerator: 0, denominator: 0, raw_ratio: null, state: "NO_POPULATION", alert: null });
  assert.deepEqual(evaluateCoverage(0, 10), { numerator: 0, denominator: 10, raw_ratio: 0, state: "NO_COVERAGE", alert: "LOW_COVERAGE" });
  assert.deepEqual(evaluateCoverage(0, 10, 0), { numerator: 0, denominator: 10, raw_ratio: 0, state: "NO_COVERAGE", alert: null });
  assert.equal(evaluateCoverage(1, 10).alert, null, "coverage equal to threshold does not alert");
  assert.equal(evaluateCoverage(1, 11).alert, "LOW_COVERAGE", "comparison uses raw ratio, not rounded display");
  assert.equal(evaluateCoverage(10, 10).state, "FULL");
  assert.throws(() => evaluateCoverage(1, 10, 0.105), /hundredths/);
  assert.throws(() => evaluateCoverage(1, 10, 1), /below 1/);
});

test("semantic authority preserves the exact 8 + 3 + 3 scope classification", context => {
  const authority = join(ROOT, "..", "..", "docs", "contracts", "evaluation", "metric-catalog.md");
  try {
    const rows = [...readFileSync(authority, "utf8").matchAll(/^\| ([a-z][a-z0-9-]+) \| 1\.0\.0 \| (DIRECT|B_TASK_READING|A_PROFILE_1\.0) \|/gm)];
    const groups = Object.groupBy(rows, match => match[2]);
    assert.equal(rows.length, 14);
    assert.equal(groups.DIRECT.length, 8);
    assert.equal(groups.B_TASK_READING.length, 3);
    assert.equal(groups["A_PROFILE_1.0"].length, 3);
    assert.deepEqual(rows.map(match => match[1]).sort(), EXPECTED_METRIC_IDS);
  } catch (error) {
    if (error.code === "ENOENT") context.skip("standalone checkout has no parent semantic repository");
    else throw error;
  }
});

test("packaged fixture manifest covers one positive and every fail-closed mutation", () => {
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "fixture-cases-1.0.0.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true, allErrors: true }).compile(schema)(fixtures), true);
  assert.equal(fixtures.fixture_version, "1.0.0");
  assert.equal(fixtures.positive.length, 1);
  assert.equal(fixtures.negative.length, 18);
  assert.deepEqual(fixtures.negative.map(item => item.case_id).sort(), [
    "coverage-basis-drift", "duplicate-input-id", "duplicate-metric-id", "eligibility-drift",
    "exclusion-drift", "formula-drift", "input-source-mismatch", "kind-drift", "minimum-sample-drift",
    "missing-input-refs", "observation-dependency-drift", "semantic-ref-drift", "unexpected-input-set",
    "unexpected-metric-set", "unit-drift", "unresolved-input-ref", "wrong-per-metric-input-set", "zero-missing"
  ]);
});

function pointer(root, pointerPath) {
  const segments = pointerPath.split("/").slice(1).map(value => value.replaceAll("~1", "/").replaceAll("~0", "~"));
  const key = segments.pop();
  const parent = segments.reduce((value, segment) => value[segment], root);
  return { parent, key };
}

function applyOperation(catalog, operation) {
  const target = pointer(catalog, operation.path);
  if (operation.op === "remove") delete target.parent[target.key];
  if (operation.op === "replace") target.parent[target.key] = structuredClone(operation.value);
  if (operation.op === "copy") {
    const source = pointer(catalog, operation.from);
    target.parent[target.key] = structuredClone(source.parent[source.key]);
  }
  if (operation.op === "add") target.key === "-" ? target.parent.push(structuredClone(operation.value)) : target.parent.splice(Number(target.key), 0, structuredClone(operation.value));
}

for (const fixture of JSON.parse(readFileSync(FIXTURES, "utf8")).negative) {
  test(`invalid fixture fails closed: ${fixture.case_id}`, () => {
    const catalog = JSON.parse(readFileSync(EXAMPLE, "utf8"));
    for (const operation of fixture.operations) applyOperation(catalog, operation);
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "evaluation-contract-"));
    const fixturePath = join(fixtureDirectory, `${fixture.case_id}.json`);
    writeFileSync(fixturePath, `${JSON.stringify(catalog, null, 2)}\n`);
    const result = runChecker(fixturePath);
    rmSync(fixtureDirectory, { recursive: true, force: true });
    assert.notEqual(result.status, 0, "invalid fixture unexpectedly passed");
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(fixture.expected_error));
  });
}

test("publication record freezes the exact 1.0.0 validator-only release", () => {
  const policy = readFileSync(join(ROOT, "VERSION_POLICY.md"), "utf8");
  assert.match(policy, /Metric Catalog `0\.1\.0`.*NON_RESOLVING_LEGACY_HISTORY_ONLY/s);
  const record = JSON.parse(readFileSync(join(ROOT, "publication", "publication-record-1.0.0.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-1.0.0.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true }).compile(schema)(record), true);
  assert.equal(record.contract_revision, "agentops.evaluation.metric-catalog@1.0.0");
  assert.equal(record.status, "PUBLISHED");
  assert.equal(record.published, true);
  assert.equal(record.conformance_claim, "VALIDATOR_ONLY");
  assert.deepEqual(record.dependencies, JSON.parse(readFileSync(EXAMPLE, "utf8")).dependencies);
  assert.equal(record.source_revision, "sha256:602bc43accf86911a2d3d89a346058277c5ebb86bc2cc152eaa39000d6768326");
  assert.equal(record.catalog_semantic_digest, "sha256:6dbb4375507a3a2eebbe5e86bb6f0a40ebf811790f55ee841b15c6942e1f159d");
  assert.equal(record.gates["contract.gate.1"], "PASS_evaluation_gate1_v2");
  assert.equal(record.gates["contract.gate.2"], "PASS_evaluation_gate2_v2");
  assert.equal(record.gates["contract.gate.3"], "PASS_25_TESTS_1_POSITIVE_18_NEGATIVE");
  assert.equal(record.gates["contract.gate.4"], "PASS_evaluation_gate4_v2");
  assert.equal(record.gates["contract.gate.5"], "PASS_EXACT_REVISION_MATCH");
  assert.equal(record.gates["contract.gate.6"], "PASS_1_SEMANTIC_14_ARTIFACTS");
  assert.equal(record.gates.owner_approval, "https://github.com/firestige/workflow-self-recursive/issues/79#issuecomment-5367772885");
  function walk(directory) {
    return readdirSync(directory).sort().flatMap(name => {
      const path = join(directory, name);
      const rel = relative(ROOT, path);
      if (rel === "node_modules" || rel.startsWith("node_modules/") || rel === ".gitignore" || rel === "publication/publication-record-1.0.0.json") return [];
      return statSync(path).isDirectory() ? walk(path) : [rel];
    });
  }
  assert.deepEqual(record.artifacts.map(artifact => artifact.path), walk(ROOT));
  for (const artifact of record.artifacts) {
    assert.equal(artifact.sha256, createHash("sha256").update(readFileSync(join(ROOT, artifact.path))).digest("hex"), artifact.path);
  }
  assert.equal(record.content_revision, `sha256:${createHash("sha256").update(JSON.stringify(record.artifacts)).digest("hex")}`);
});
