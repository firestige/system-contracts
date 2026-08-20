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
  const ajv = new Ajv({ strict: true, allErrors: true });
  for (const path of [SCHEMA, join(ROOT, "schemas", "fixture-cases-1.0.0.schema.json"), join(ROOT, "schemas", "publication-record-1.0.0.schema.json")]) {
    assert.doesNotThrow(() => ajv.compile(JSON.parse(readFileSync(path, "utf8"))));
  }
});

test("the normative example passes schema and semantic validation", () => {
  const result = runChecker(EXAMPLE);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: 15 metrics, unique IDs, resolved input refs, never-zero missing semantics/);
});

test("the example contains exactly the 15 issue #43 metric IDs", () => {
  const catalog = JSON.parse(readFileSync(EXAMPLE, "utf8"));
  assert.equal(catalog.version, "1.0.0");
  assert.ok(catalog.metrics.every(metric => metric.version === "1.0.0"));
  assert.ok(catalog.metrics.flatMap(metric => metric.question_refs).every(question => question.version === "1.0.0"));
  assert.deepEqual(catalog.metrics.map(({ metric_id }) => metric_id).sort(), EXPECTED_METRIC_IDS);
});

test("semantic authority preserves the exact 8 + 3 + 4 scope classification", context => {
  const authority = join(ROOT, "..", "..", "docs", "contracts", "evaluation", "metric-catalog.md");
  try {
    const rows = [...readFileSync(authority, "utf8").matchAll(/^\| ([a-z][a-z0-9-]+) \| 1\.0\.0 \| (DIRECT|B_TASK_READING|A_PROFILE_1\.0) \|/gm)];
    const groups = Object.groupBy(rows, match => match[2]);
    assert.equal(rows.length, 15);
    assert.equal(groups.DIRECT.length, 8);
    assert.equal(groups.B_TASK_READING.length, 3);
    assert.equal(groups["A_PROFILE_1.0"].length, 4);
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
  assert.equal(fixtures.negative.length, 9);
  assert.deepEqual(fixtures.negative.map(item => item.case_id).sort(), [
    "duplicate-input-id", "duplicate-metric-id", "input-source-mismatch", "missing-input-refs",
    "unexpected-input-set", "unexpected-metric-set", "unresolved-input-ref", "wrong-per-metric-input-set", "zero-missing"
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

test("publication record remains an unpublished exact 1.0.0 candidate", () => {
  const policy = readFileSync(join(ROOT, "VERSION_POLICY.md"), "utf8");
  assert.match(policy, /Metric Catalog `0\.1\.0`.*NON_RESOLVING_LEGACY_HISTORY_ONLY/s);
  const record = JSON.parse(readFileSync(join(ROOT, "publication", "publication-record-1.0.0.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-1.0.0.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true }).compile(schema)(record), true);
  assert.equal(record.contract_revision, "agentops.evaluation.metric-catalog@1.0.0");
  assert.equal(record.status, "REVIEW_CANDIDATE");
  assert.equal(record.published, false);
  assert.equal(record.conformance_claim, "NONE");
  assert.equal(record.gates["contract.gate.3"], "CANDIDATE_VERIFIED");
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
});
