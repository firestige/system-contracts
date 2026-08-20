const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { join, relative } = require("node:path");
const test = require("node:test");
const Ajv = require("ajv");
const { canonicalDigest, validateBatch, validateRecord, validateSequence } = require("./validator.cjs");

const ROOT = join(__dirname, "..");
const REGISTRY = join(ROOT, "registries", "observation-profile-1.0.0.json");
const CHECKER = join(ROOT, "tools", "check-corpus.cjs");
const SCHEMAS = [
  "delivery-manifest-0.1.0.schema.json",
  "delivery-lifecycle-result-0.1.0.schema.json",
  "observation-record-1.0.0.schema.json",
  "otlp-interaction-1.0.0.schema.json",
  "implementation-family-1.schema.json",
  "system-design-family-1.schema.json",
  "fixture-case-0.1.0.schema.json",
  "publication-record-0.1.0.schema.json"
];
const CATEGORIES = [
  "positive", "negative", "base-endpoint", "multi-target",
  "duplicate-conflict", "partial-success", "sampling", "privacy",
  "lineage", "crash-recovery", "completeness", "usage", "retention"
];

test("all normative schemas exist and compile in Ajv strict mode", () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  for (const filename of SCHEMAS) {
    const path = join(ROOT, "schemas", filename);
    assert.equal(existsSync(path), true, `missing ${filename}`);
    assert.doesNotThrow(() => ajv.compile(JSON.parse(readFileSync(path, "utf8"))), filename);
  }
});

test("encoded registry fixes the 1.0.0 pins, closed names, fields, and limits", () => {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
  assert.equal(registry.profile_version, "1.0.0");
  assert.equal(registry.pins.opentelemetry_specification, "1.56.0");
  assert.equal(registry.pins.otlp_protobuf, "1.10.0");
  assert.equal(registry.pins.semantic_conventions, "1.41.1");
  assert.equal(registry.event_names.length, 10);
  assert.equal(registry.fields.common.length, 57);
  assert.equal(registry.fields.implementation.length, 10);
  assert.equal(registry.fields.system_design.length, 6);
  assert.equal(new Set(Object.values(registry.fields).flat().map(field => field.name)).size, 73);
  assert.equal(registry.limits.batch.max_records, 512);
  assert.equal(registry.limits.batch.max_bytes, 4194304);
  assert.equal(registry.limits.page.default_records, 100);
  assert.equal(registry.limits.page.max_records, 500);
  assert.equal(registry.limits.text.finding_summary_max_chars, 512);
  assert.equal(registry.defaults.head_sampling_probability, 1);
  assert.deepEqual(registry.digest, { algorithm: "sha-256", encoding: "lowercase-hex", canonicalization: "RFC8785-JCS" });
});

test("encoded field names match the parent semantic authority when checked in the workspace", (context) => {
  const profilePath = join(ROOT, "..", "..", "docs", "contracts", "observation", "otel-observation-profile.md");
  if (!existsSync(profilePath)) { context.skip("standalone checkout has no parent prose repository"); return; }
  const rows = [...readFileSync(profilePath, "utf8").matchAll(/^\| ([CIS]\d{2}) \| `([^`]+)` \|/gm)]
    .map(([, id, name]) => ({ id, name }));
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const encoded = Object.values(registry.fields).flat().map(({ id, name }) => ({ id, name }));
  assert.deepEqual(encoded, rows);
});

test("fixture corpus covers every issue #42 category", () => {
  const actual = readdirSync(join(ROOT, "fixtures"), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(actual, [...CATEGORIES].sort());
  for (const category of CATEGORIES) {
    assert.ok(readdirSync(join(ROOT, "fixtures", category)).some(name => name.endsWith(".json")), `empty ${category}`);
  }
});

test("reference producer and acceptor agree on the complete fixture corpus", () => {
  for (const role of ["producer", "acceptor"]) {
    const result = spawnSync(process.execPath, [CHECKER, "--role", role], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(`PASS ${role}:`));
  }
});

test("complete Review/Finding bases and lifecycle endpoints fail closed", () => {
  const finding = JSON.parse(readFileSync(join(ROOT, "fixtures", "base-endpoint", "artifact-target.json"), "utf8")).input.records[0];
  const missingArtifact = structuredClone(finding);
  delete missingArtifact.attributes["agentops.artifact.id"];
  assert.equal(validateRecord(missingArtifact).valid, false);
  const illegalCount = structuredClone(finding);
  illegalCount.attributes["agentops.review.observed.count"] = 0;
  assert.equal(validateRecord(illegalCount).valid, false);

  const lifecycle = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "finding-fix-recheck.json"), "utf8")).input.records;
  assert.equal(validateSequence(lifecycle).decision, "ACCEPT");
  const wrongEndpoint = structuredClone(lifecycle);
  wrongEndpoint[2].attributes["agentops.recheck.review.id"] = "another-review";
  assert.equal(validateSequence(wrongEndpoint).decision, "REJECT");
});

test("unresolved lifecycle state cannot fabricate a Runtime outcome", () => {
  const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "crash-recovery", "ambiguous-result.json"), "utf8"));
  const unresolved = fixture.input.lifecycle_result;
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "delivery-lifecycle-result-0.1.0.schema.json"), "utf8"));
  const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(unresolved), true);
  const fabricated = structuredClone(unresolved);
  fabricated.outcome = "INCOMPLETE";
  assert.equal(validate(fabricated), false);
});

test("canonical digest and batch limits are executable physical decisions", () => {
  assert.equal(canonicalDigest({ b: 2, a: 1 }), "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
  const sampling = JSON.parse(readFileSync(join(ROOT, "fixtures", "sampling", "default-head.json"), "utf8")).input.records[0];
  const oversized = Array.from({ length: 513 }, (_, index) => {
    const record = structuredClone(sampling);
    record.attributes["agentops.event.id"] = `event-${index}`;
    return record;
  });
  assert.equal(validateBatch(oversized).decision, "REJECT");
  assert.equal(validateBatch([sampling], { encodedBytes: 4194305 }).decision, "REJECT");
});

test("interaction schema exposes only bounded OTLP aggregate responses", () => {
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "otlp-interaction-1.0.0.schema.json"), "utf8"));
  const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
  const partial = {
    interaction_version: "1.0.0",
    request: { carrier: "OTLP_HTTP_PROTOBUF", record_count: 2, encoded_bytes: 1024, profile_versions: ["1.0.0"], attempt: 1 },
    response: { kind: "PARTIAL_SUCCESS", rejected_records: 1, reason: "one profile-invalid record" }
  };
  assert.equal(validate(partial), true);
  const leaked = structuredClone(partial);
  leaked.response.dispositions = ["accepted", "rejected"];
  assert.equal(validate(leaked), false, "external response must not expose Admission dispositions");
  const oversized = structuredClone(partial);
  oversized.request.encoded_bytes = 4194305;
  assert.equal(validate(oversized), false);
  const unsupported = structuredClone(partial);
  unsupported.request.profile_versions = ["0.3.0"];
  assert.equal(validate(unsupported), false);
});

test("publication record remains an unpublished review candidate", () => {
  const policy = readFileSync(join(ROOT, "VERSION_POLICY.md"), "utf8");
  assert.match(policy, /Observation Contract\/Profile `0\.3\.0`.*NON_RESOLVING_LEGACY_HISTORY_ONLY/s);
  const record = JSON.parse(readFileSync(join(ROOT, "publication", "publication-record-1.0.0.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-0.1.0.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true }).compile(schema)(record), true);
  assert.equal(record.profile_version, "1.0.0");
  assert.equal(record.status, "REVIEW_CANDIDATE");
  assert.equal(record.published, false);
  assert.equal(record.conformance_claim, "NONE");
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
    const digest = createHash("sha256").update(readFileSync(join(ROOT, artifact.path))).digest("hex");
    assert.equal(digest, artifact.sha256, artifact.path);
  }
});
