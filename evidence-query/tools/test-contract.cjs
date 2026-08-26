const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const ROOT = join(__dirname, "..");
const SUPERPROJECT = join(ROOT, "..", "..");
const validator = require("./validator.cjs");

test("validator exposes the closed evidence-query oracle", () => {
  assert.equal(typeof validator.evaluateFixture, "function");
  assert.equal(typeof validator.validateResponse, "function");
  assert.equal(typeof validator.validateInternalValue, "function");
  assert.equal(typeof validator.canonicalBatchBytes, "function");
});

test("the Wave6 manifest and all three upstream machine files match exact digests", () => {
  assert.deepEqual(validator.verifyManifestBinding(), { valid: true, errors: [] });
  assert.equal(validator.registry.manifest_binding.sha256, "e605720c5b225fa9228e2a4b1a8001f3235482ed83dc214e4c766e5caa6e1706");
  assert.equal(validator.registry.contract_revision, "0.1.0");
});

test("Accept q grammar is exact and one invalid range does not poison a supported range", () => {
  for (const value of [undefined, "*/*", "application/*;q=0.5", "text/plain;q=.5, application/json;q=1.000", "APPLICATION/JSON;Q=0.001"]) assert.equal(validator.acceptAllowsJson(value), true, value);
  for (const value of ["application/json;q=0", "application/json;q=.5", "application/json;q=1.", "application/json;q=\"1\"", "application/json;q=2", "application/json;q=1;q=1"]) assert.equal(validator.acceptAllowsJson(value), false, value);
  assert.equal(validator.acceptAllowsJson(""), false, "an empty header is not a missing header");
});

test("request classification follows path/method/body/Accept/service/filter/cursor order", () => {
  const base = { method: "GET", path: "/v1/evidence/traces", query: [["trace_id", "a".repeat(32)]] };
  assert.deepEqual(validator.classifyRequest({ ...base, path: "/missing", method: "POST" }), { http: 404, code: "ROUTE_NOT_FOUND" });
  assert.deepEqual(validator.classifyRequest({ ...base, method: "POST", body: "x" }), { http: 405, code: "METHOD_NOT_ALLOWED" });
  assert.deepEqual(validator.classifyRequest({ ...base, body: "x", accept: "text/plain" }), { http: 400, code: "INVALID_FILTER" });
  assert.deepEqual(validator.classifyRequest({ ...base, accept: "text/plain", service_available: false }), { http: 406, code: "NOT_ACCEPTABLE" });
  assert.deepEqual(validator.classifyRequest({ ...base, service_available: false, query: [["unknown", "x"]] }), { http: 503, code: "QUERY_UNAVAILABLE" });
  assert.deepEqual(validator.classifyRequest({ ...base, query: [["trace_id", "a".repeat(32)], ["trace_id", "b".repeat(32)]] }), { http: 400, code: "INVALID_FILTER" });
  assert.deepEqual(validator.classifyRequest({ ...base, query: [["trace_id", "a".repeat(32)], ["cursor", "opaque"]], cursor_state: "tampered" }), { http: 400, code: "INVALID_CURSOR" });
  assert.deepEqual(validator.classifyRequest({ ...base, query: [["trace_id", "a".repeat(32)], ["cursor", "opaque"]], cursor_state: "mismatch" }), { http: 409, code: "CURSOR_MISMATCH" });
  assert.deepEqual(validator.classifyRequest({ ...base, query: [["trace_id", "a".repeat(32)], ["cursor", "opaque"]], cursor_state: "restart-lost" }), { http: 410, code: "CURSOR_EXPIRED" });
});

test("Trace NODE/PARENT_EDGE/LINK identities collapse exact duplicates and reject metadata conflicts", () => {
  const node = { kind: "NODE", trace_id: "a".repeat(32), span_id: "b".repeat(16) };
  const parent = { kind: "PARENT_EDGE", trace_id: "a".repeat(32), recording_span_id: "b".repeat(16), parent_span_id: "c".repeat(16) };
  const link = { kind: "LINK", trace_id: "a".repeat(32), recording_span_id: "b".repeat(16), target_trace_id: "d".repeat(32), target_span_id: "e".repeat(16), trace_state: "vendor=x", flags: 1 };
  assert.equal(validator.classifyTraceIdentity([node, parent, link]), "ACCEPT");
  assert.equal(validator.classifyTraceIdentity([link, structuredClone(link)]), "DUPLICATE");
  assert.equal(validator.classifyTraceIdentity([link, { ...link, flags: 2 }]), "CONFLICT");
  const absentMetadata = { ...link }; delete absentMetadata.flags;
  assert.equal(validator.classifyTraceIdentity([link, absentMetadata]), "CONFLICT");
});

test("registry closes model-attribution creation and LINK metadata identity rules", () => {
  assert.equal(validator.registry.projection.MODEL_ATTRIBUTION.creation_condition, "C57_PRESENT");
  assert.deepEqual(validator.registry.trace_identity, {
    NODE: ["NODE", "trace_id", "span_id"],
    PARENT_EDGE: ["PARENT_EDGE", "trace_id", "recording_span_id", "parent_span_id"],
    LINK: ["LINK", "trace_id", "recording_span_id", "target_trace_id", "target_span_id"],
    link_detail_not_identity: ["trace_state", "flags"]
  });
});

test("truth table preserves explicit zero and removes unavailable/not-applicable measurement values", () => {
  const active = JSON.parse(readFileSync(join(ROOT, "examples", "facts-response-0.1.0.json"), "utf8"));
  active.items = [active.items[0]];
  active.items[0].fields.find(field => field.field === "C46").value = 0;
  assert.equal(validator.validateResponse(active, "facts").valid, true, "explicit FINAL zero is retained");
  for (const completeness of ["UNAVAILABLE", "NOT_APPLICABLE"]) {
    const invalid = structuredClone(active);
    invalid.items[0].truth.completeness = completeness;
    invalid.items[0].truth.availability = completeness === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
    invalid.items[0].compatibility.completeness = completeness;
    assert.equal(validator.validateResponse(invalid, "facts").valid, false, `${completeness} must not retain C46`);
    const valid = structuredClone(invalid);
    valid.items[0].fields = valid.items[0].fields.filter(field => field.field !== "C46");
    assert.equal(validator.validateResponse(valid, "facts").valid, true, `${completeness} retains coordinates without a value`);
  }
});

test("Event source identity equals C09 while Finding assertion owner stays its projection tuple", () => {
  const response = JSON.parse(readFileSync(join(ROOT, "examples", "facts-response-0.1.0.json"), "utf8"));
  response.items = [response.items[0]];
  response.items[0].source.event_id = "different-event";
  assert.equal(validator.validateResponse(response, "facts").valid, false);

  const assertion = structuredClone(response.items[0]);
  assertion.id = "opaque-finding-assertion";
  assertion.kind = "FINDING_ASSERTION";
  assertion.source.event_id = "finding-event";
  assertion.provenance.owner_key = ["finding-1", "scope-1"];
  assertion.compatibility.event_name = "review.finding";
  assertion.compatibility.completeness = null;
  assertion.compatibility.dimensions = [{ field: "C13", value: "FRESH_READER" }, { field: "C14", value: "WHOLE_SCOPE" }];
  assertion.truth.completeness = null;
  assertion.fields = [
    { field: "C13", value: "FRESH_READER" }, { field: "C14", value: "WHOLE_SCOPE" }, { field: "C15", value: "MAJOR" },
    { field: "C20", value: "review-1" }, { field: "C28", value: "artifact-1" }, { field: "C29", value: "1".repeat(64) },
    { field: "C33", value: "writer" }, { field: "C34", value: "reviewer" }, { field: "C36", value: "write-1" },
    { field: "C37", value: "review-1" }, { field: "C49", value: "implementation@1" }, { field: "C50", value: "bounded finding" }
  ];
  assert.equal(validator.validateResponse({ ...response, items: [assertion] }, "facts").valid, true);
});

test("ExpiryBatch framing preserves kind and scalar type and validates exact digest", () => {
  const members = [
    { resource_kind: "FINDING_ASSERTION", owner_key: ["f", "scope"] },
    { resource_kind: "FINDING_STATUS", owner_key: ["f", "scope", "review"] }
  ].sort((a, b) => Buffer.compare(validator.encodeScalar([a.resource_kind, a.owner_key]), validator.encodeScalar([b.resource_kind, b.owner_key])));
  const batch = { value_type: "ExpiryBatch", batch_identity: "0".repeat(64), resource_class: "FACTUAL_PROJECTION", policy_revision: "1.0.0", cutoff: "2026-01-01T00:00:00.000000Z", ttl_seconds: 86400, members };
  batch.batch_identity = createHash("sha256").update(validator.canonicalBatchBytes(batch)).digest("hex");
  assert.equal(validator.validateInternalValue(batch).valid, true);
  assert.notDeepEqual(validator.encodeScalar(1), validator.encodeScalar(1.5));
  assert.notEqual(batch.batch_identity, createHash("sha256").update(validator.canonicalBatchBytes({ ...batch, ttl_seconds: 86401 })).digest("hex"));
});

test("ExpiryRecord compatibility enforces exact dimension order and Delivery-root fourth pair", () => {
  const model = JSON.parse(readFileSync(join(ROOT, "examples", "expiry-record-1.0.0.json"), "utf8"));
  assert.equal(validator.validateInternalValue(model).valid, true);
  const swapped = structuredClone(model);
  [swapped.compatibility[3], swapped.compatibility[4]] = [swapped.compatibility[4], swapped.compatibility[3]];
  assert.equal(validator.validateInternalValue(swapped).valid, false);
  const delivery = {
    value_type: "ExpiryRecord", resource_class: "FACTUAL_PROJECTION", owner_key: ["a".repeat(32)],
    source: { kind: "SPAN", trace_id: "a".repeat(32), span_id: "b".repeat(16) }, resource_kind: "DELIVERY_ROOT_BINDING",
    recorded_at: "2026-01-01T00:00:00.000000Z",
    compatibility: [["family_schema", null], ["event_name", null], ["completeness", null], ["delivery_id", "delivery-1"]],
    policy_revision: "1.0.0", expires_at: "2027-01-01T00:00:00.000000Z", expired_at: "2027-01-01T00:00:01.000000Z"
  };
  assert.equal(validator.validateInternalValue(delivery).valid, true);
  delivery.compatibility.push(["C01", "delivery-1"]);
  assert.equal(validator.validateInternalValue(delivery).valid, false);
});

test("Trace ExpiryOwner validates exact identity coordinates, not only tuple arity", () => {
  for (const value of [
    { value_type: "ExpiryOwner", resource_kind: "NODE", owner_key: ["a".repeat(32), "b".repeat(16)] },
    { value_type: "ExpiryOwner", resource_kind: "PARENT_EDGE", owner_key: ["a".repeat(32), "b".repeat(16), "c".repeat(16)] },
    { value_type: "ExpiryOwner", resource_kind: "LINK", owner_key: ["a".repeat(32), "b".repeat(16), "c".repeat(32), "d".repeat(16)] }
  ]) assert.equal(validator.validateInternalValue(value).valid, true);
  assert.equal(validator.validateInternalValue({ value_type: "ExpiryOwner", resource_kind: "NODE", owner_key: ["not-a-trace", "not-a-span"] }).valid, false);
});

test("Factual ExpiryOwner validates exact tuple types, not only tuple arity", () => {
  const valid = [
    { resource_kind: "EVENT_CONTRIBUTION", owner_key: ["usage", "event-1"] },
    { resource_kind: "FINDING_TARGET", owner_key: ["finding-1", "scope-1", "src/x.js", "L1", null] },
    { resource_kind: "FINDING_FIX", owner_key: ["finding-1", "scope-1", "src/x.js", "L1", null, "fix-1"] },
    { resource_kind: "DELIVERY_ROOT_BINDING", owner_key: ["a".repeat(32)] },
    { resource_kind: "MODEL_ATTRIBUTION", owner_key: ["openai", "gpt", "reviewer", "task-1", "a".repeat(32), "b".repeat(16)] }
  ];
  for (const value of valid) assert.equal(validator.validateInternalValue({ value_type: "ExpiryOwner", ...value }).valid, true, value.resource_kind);
  for (const value of [
    { resource_kind: "FINDING_TARGET", owner_key: ["finding-1", "scope-1", "src/x.js", "L1", 0] },
    { resource_kind: "FINDING_FIX", owner_key: ["finding-1", "scope-1", "src/x.js", "L1", null, false] },
    { resource_kind: "DELIVERY_ROOT_BINDING", owner_key: ["not-a-trace"] },
    { resource_kind: "MODEL_ATTRIBUTION", owner_key: ["openai", "gpt", "reviewer", "task-1", "not-a-trace", "not-a-span"] }
  ]) assert.equal(validator.validateInternalValue({ value_type: "ExpiryOwner", ...value }).valid, false, value.resource_kind);
});

test("factual expiry markers and expired public Facts retain exact source-bound owners", () => {
  const marker = JSON.parse(readFileSync(join(ROOT, "examples", "expiry-record-1.0.0.json"), "utf8"));
  const wrongMarkerSource = structuredClone(marker);
  wrongMarkerSource.source.trace_id = "f".repeat(32);
  assert.equal(validator.validateInternalValue(wrongMarkerSource).valid, false);

  const response = JSON.parse(readFileSync(join(ROOT, "examples", "facts-response-0.1.0.json"), "utf8"));
  const model = response.items.find(item => item.kind === "MODEL_ATTRIBUTION");
  model.truth.expiry = "EXPIRED";
  model.truth.availability = "UNAVAILABLE";
  model.fields = [];
  model.relationships = [];
  model.provenance.owner_key[4] = "f".repeat(32);
  assert.equal(validator.validateResponse({ ...response, items: [model] }, "facts").valid, false);
});

test("planning selects by kind then stored compact owner bytes before canonical member sorting", () => {
  const input = {
    limit: 2,
    resources: [
      { resource_kind: "NODE", owner_key: ["b", "1"], stored_owner_key_json: "[\"b\",\"1\"]", eligible: true, marked: false },
      { resource_kind: "LINK", owner_key: ["z", "1", "t", "s"], stored_owner_key_json: "[\"z\",\"1\",\"t\",\"s\"]", eligible: true, marked: false },
      { resource_kind: "LINK", owner_key: ["a", "1", "t", "s"], stored_owner_key_json: "[\"a\",\"1\",\"t\",\"s\"]", eligible: true, marked: false },
      { resource_kind: "LINK", owner_key: ["0", "1", "t", "s"], stored_owner_key_json: "[\"0\",\"1\",\"t\",\"s\"]", eligible: false, marked: false }
    ]
  };
  assert.deepEqual(validator.planMembers(input), [input.resources[2], input.resources[1]].map(({ resource_kind, owner_key }) => ({ resource_kind, owner_key })).sort((a, b) => Buffer.compare(validator.encodeScalar([a.resource_kind, a.owner_key]), validator.encodeScalar([b.resource_kind, b.owner_key]))));
});

function fixturePaths(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? fixturePaths(path) : path.endsWith(".json") ? [path] : [];
  });
}

test("all positive, negative, and recovery fixtures have closed envelopes and expected oracle outcomes", () => {
  const paths = fixturePaths(join(ROOT, "fixtures"));
  assert.ok(paths.length >= 15);
  const categories = new Set();
  for (const path of paths) {
    const fixture = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(validator.fixtureOracle(fixture), true, `${path}: ${JSON.stringify(validator.fixtureOracle.errors)}`);
    assert.equal(validator.evaluateFixture(fixture), fixture.expected, path);
    categories.add(fixture.category);
  }
  assert.deepEqual([...categories].sort(), ["negative", "positive", "recovery"]);
});

test("closed examples validate Fact, Trace, expiry marker, and batch surfaces", () => {
  const facts = JSON.parse(readFileSync(join(ROOT, "examples", "facts-response-0.1.0.json"), "utf8"));
  const traces = JSON.parse(readFileSync(join(ROOT, "examples", "traces-response-0.1.0.json"), "utf8"));
  const marker = JSON.parse(readFileSync(join(ROOT, "examples", "expiry-record-1.0.0.json"), "utf8"));
  const batch = JSON.parse(readFileSync(join(ROOT, "examples", "expiry-batch-1.0.0.json"), "utf8"));
  assert.deepEqual(validator.validateResponse(facts, "facts"), { valid: true, errors: [] });
  assert.deepEqual(validator.validateResponse(traces, "traces"), { valid: true, errors: [] });
  assert.deepEqual(validator.validateInternalValue(marker), { valid: true, errors: [] });
  assert.deepEqual(validator.validateInternalValue(batch), { valid: true, errors: [] });
});

test("corpus checker reports the closed candidate surface", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "tools", "check-corpus.cjs")], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: 17 fixtures \(5 positive, 7 negative, 5 recovery\), 4 examples, exact manifest binding/);
});

test("immutable publication candidate remains the qualified historical record", () => {
  const recordPath = join(ROOT, "publication", "publication-candidate-0.1.0.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-candidate-0.1.0.schema.json"), "utf8"));
  assert.equal(new (require("ajv"))({ strict: true, allErrors: true }).compile(schema)(record), true);
  assert.equal(record.contract_revision, "evidence.query@0.1.0");
  assert.equal(record.status, "REVIEW_CANDIDATE");
  assert.equal(record.published, false);
  assert.equal(record.conformance_claim, "VALIDATOR_ONLY");
  assert.equal(record.schema_only_conformance, false);
  assert.equal(createHash("sha256").update(readFileSync(recordPath)).digest("hex"), "97c3e158c18cd7e92da949d82a17b71c5e4bf08d081fef6e5f4b6dcb9c00c6a7");
  assert.equal(record.content_revision, `sha256:${createHash("sha256").update(JSON.stringify(record.artifacts)).digest("hex")}`);
});

test("frozen publication binds the qualified RC and final semantic bytes", () => {
  const recordPath = join(ROOT, "publication", "publication-record-0.1.0.json");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-0.1.0.schema.json"), "utf8"));
  assert.equal(new (require("ajv"))({ strict: true, allErrors: true }).compile(schema)(record), true);
  assert.equal(record.contract_revision, "evidence.query@0.1.0");
  assert.equal(record.status, "FROZEN");
  assert.equal(record.published, true);
  assert.equal(record.conformance_claim, "VALIDATOR_ONLY");
  assert.equal(record.candidate_publication.target_commit, "dc8a50e92eebfc35bd706579ff2bf5e9beb57782");
  assert.equal(record.gates.owner_approval, "https://github.com/firestige/workflow-self-recursive/issues/50#issuecomment-5427870271");
  for (const binding of [record.semantic, record.translation]) {
    assert.equal(binding.sha256, createHash("sha256").update(readFileSync(join(SUPERPROJECT, binding.path))).digest("hex"));
  }
  function walk(directory) {
    return readdirSync(directory).sort().flatMap(name => {
      const path = join(directory, name);
      const relative = path.slice(ROOT.length + 1);
      if (relative === "node_modules" || relative.startsWith("node_modules/") || relative === ".gitignore" || relative === "publication/publication-record-0.1.0.json") return [];
      return statSync(path).isDirectory() ? walk(path) : [relative];
    });
  }
  assert.deepEqual(record.artifacts.map(artifact => artifact.path), walk(ROOT));
  for (const artifact of record.artifacts) {
    assert.equal(artifact.sha256, createHash("sha256").update(readFileSync(join(ROOT, artifact.path))).digest("hex"), artifact.path);
  }
  assert.equal(record.content_revision, `sha256:${createHash("sha256").update(JSON.stringify(record.artifacts)).digest("hex")}`);
  assert.equal(validator.registry.status, "FROZEN");
});
