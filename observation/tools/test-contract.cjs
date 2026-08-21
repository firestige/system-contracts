const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { join, relative } = require("node:path");
const test = require("node:test");
const Ajv = require("ajv");
const {
  admitBatch,
  canonicalDigest,
  decodeOtlpRequest,
  mapOtlpOutcome,
  validateBatch,
  validateInteractionContract,
  validateRecord,
  validateSequence
} = require("./validator.cjs");

const ROOT = join(__dirname, "..");
const REGISTRY = join(ROOT, "registries", "observation-profile-1.0.0.json");
const CHECKER = join(ROOT, "tools", "check-corpus.cjs");
const SCHEMAS = [
  "compatibility-matrix-1.0.0.schema.json",
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
  const applicableIds = new Set([
    ...registry.applicability.span.allowed,
    ...Object.values(registry.applicability.events).flatMap(rule => rule.allowed)
  ]);
  assert.deepEqual([...applicableIds].sort(), Object.values(registry.fields).flat().map(field => field.id).sort(), "every field must have a closed carrier/EventName placement");
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

  const multiTarget = JSON.parse(readFileSync(join(ROOT, "fixtures", "multi-target", "two-sections.json"), "utf8")).input.records;
  assert.equal(validateSequence(multiTarget).decision, "ACCEPT");
  const provenanceDrift = structuredClone(multiTarget);
  provenanceDrift[1].attributes["agentops.writer.invocation.id"] = "different-source-writer";
  assert.equal(validateSequence(provenanceDrift).decision, "CONFLICT");

  const ordinaryWithRecheckField = structuredClone(finding);
  ordinaryWithRecheckField.attributes["agentops.recheck.review.id"] = "stray-review";
  assert.equal(validateRecord(ordinaryWithRecheckField).valid, false, "ordinary Finding must not carry any Recheck field");
  const combined = structuredClone(lifecycle[1]);
  Object.assign(combined.attributes, {
    "agentops.recheck.id": "recheck-combined",
    "agentops.recheck.review.id": "review-source",
    "agentops.recheck.finding.id": "finding-3",
    "agentops.iteration.id": "iteration-combined",
    "agentops.recheck.role.id": "rechecker",
    "agentops.recheck.invocation.id": "recheck-combined"
  });
  assert.equal(validateRecord(combined).valid, false, "Fix and Recheck compositions are mutually exclusive");
});

test("Fix and Recheck contribution identity includes the selected target edge", () => {
  const assertions = JSON.parse(readFileSync(join(ROOT, "fixtures", "multi-target", "two-sections.json"), "utf8")).input.records;
  const fixA = structuredClone(assertions[0]);
  const fixB = structuredClone(assertions[1]);
  for (const [index, fix] of [fixA, fixB].entries()) {
    fix.attributes["agentops.event.id"] = `event-m-fix-${index}`;
    fix.attributes["agentops.review.id"] = "review-fix";
    fix.attributes["agentops.finding.status"] = "CLOSED_FIXED";
    fix.attributes["agentops.fix.id"] = "fix-shared";
    fix.attributes["agentops.fix.finding.id"] = "finding-2";
  }
  const recheckA = structuredClone(fixA);
  const recheckB = structuredClone(fixB);
  for (const [index, recheck] of [recheckA, recheckB].entries()) {
    delete recheck.attributes["agentops.fix.id"];
    delete recheck.attributes["agentops.fix.finding.id"];
    recheck.attributes["agentops.event.id"] = `event-m-recheck-${index}`;
    recheck.attributes["agentops.review.id"] = "review-recheck";
    recheck.attributes["agentops.recheck.id"] = "recheck-shared";
    recheck.attributes["agentops.recheck.review.id"] = "review-2";
    recheck.attributes["agentops.recheck.finding.id"] = "finding-2";
    recheck.attributes["agentops.recheck.fix.id"] = "fix-shared";
    recheck.attributes["agentops.iteration.id"] = "iteration-1";
    recheck.attributes["agentops.recheck.role.id"] = "rechecker";
    recheck.attributes["agentops.recheck.invocation.id"] = `recheck-invocation-${index}`;
  }
  assert.equal(validateSequence([...assertions, fixA, fixB, recheckA, recheckB]).decision, "ACCEPT");
  const wrongTarget = structuredClone(recheckB);
  assert.equal(validateSequence([...assertions, fixA, wrongTarget]).decision, "REJECT", "C26 must select a Fix accepted for the same target edge");
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

test("interaction schema fixes loopback signal paths and separates HTTP responses from transport failures", () => {
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "otlp-interaction-1.0.0.schema.json"), "utf8"));
  const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
  const partial = {
    interaction_version: "1.0.0",
    base_url: "http://127.0.0.1:4318",
    request: { carrier: "OTLP_HTTP_PROTOBUF", content_type: "application/x-protobuf", signal: "traces", path: "/v1/traces", record_count: 2, encoded_bytes: 1024, profile_version: "1.0.0", family_schema: "implementation@1", attempt: 1 },
    transport_result: { kind: "HTTP_RESPONSE", http_status: 200, body_kind: "EXPORT_RESPONSE", rejected_spans: 1 }
  };
  assert.equal(validate(partial), true);
  assert.equal(validateInteractionContract(partial).valid, true);
  const allRejectedPartial = structuredClone(partial);
  allRejectedPartial.transport_result.rejected_spans = 2;
  assert.equal(validateInteractionContract(allRejectedPartial).valid, false);
  const impossibleCount = structuredClone(partial);
  impossibleCount.transport_result.rejected_spans = 3;
  assert.equal(validateInteractionContract(impossibleCount).valid, false);
  const leaked = structuredClone(partial);
  leaked.transport_result.dispositions = ["accepted", "rejected"];
  assert.equal(validate(leaked), false, "external response must not expose Admission dispositions");
  const oversized = structuredClone(partial);
  oversized.request.encoded_bytes = 4194305;
  assert.equal(validate(oversized), false);
  const unsupported = structuredClone(partial);
  unsupported.request.profile_version = "0.3.0";
  assert.equal(validate(unsupported), false);
  const wrongPath = structuredClone(partial);
  wrongPath.request.path = "/v1/logs";
  assert.equal(validate(wrongPath), false);
  const noResponse = structuredClone(partial);
  noResponse.transport_result = { kind: "NO_HTTP_RESPONSE", failure: "AMBIGUOUS_COMMIT", retry_class: "RETRY_IDENTICAL" };
  assert.equal(validate(noResponse), true);
  const pseudoResponse = structuredClone(partial);
  pseudoResponse.transport_result = { kind: "HTTP_RESPONSE", http_status: 200, body_kind: "AMBIGUOUS_COMMIT" };
  assert.equal(validate(pseudoResponse), false);
});

test("C55-C57 carrier, applicability, value, and root-binding rules fail closed", () => {
  const delivery = JSON.parse(readFileSync(join(ROOT, "fixtures", "negative", "unknown-field.json"), "utf8")).input.records[0];
  delete delivery.attributes["agentops.unknown"];
  delivery.attributes["agentops.delivery.elapsed_time_ms"] = 812.5;
  delivery.attributes["agentops.delivery.stage.reached"] = "review";
  assert.equal(validateRecord(delivery).valid, true);

  const negativeElapsed = structuredClone(delivery);
  negativeElapsed.attributes["agentops.delivery.elapsed_time_ms"] = -1;
  assert.equal(validateRecord(negativeElapsed).valid, false);
  const emptyStage = structuredClone(delivery);
  emptyStage.attributes["agentops.delivery.stage.reached"] = "";
  assert.equal(validateRecord(emptyStage).valid, false);

  const sampling = JSON.parse(readFileSync(join(ROOT, "fixtures", "sampling", "default-head.json"), "utf8")).input.records[0];
  sampling.attributes["agentops.delivery.elapsed_time_ms"] = 1;
  assert.equal(validateRecord(sampling).valid, false);

  const model = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records[1];
  assert.equal(validateRecord(model).valid, true);
  const noRootBinding = structuredClone(model);
  delete noRootBinding.attributes["agentops.runtime.id"];
  assert.equal(validateRecord(noRootBinding).valid, false);
  const eventModel = structuredClone(delivery);
  eventModel.attributes["agentops.model.id"] = "provider/model";
  assert.equal(validateRecord(eventModel).valid, false);
  const wrongEventPlacement = structuredClone(delivery);
  wrongEventPlacement.attributes["agentops.review.id"] = "review-not-delivery";
  assert.equal(validateRecord(wrongEventPlacement).valid, false);

  for (const [name, value] of [["gen_ai.request.model", 123], ["gen_ai.response.model", false], ["gen_ai.usage.input_tokens", -1], ["gen_ai.usage.output_tokens", 1.5]]) {
    const invalid = structuredClone(model);
    invalid.attributes[name] = value;
    assert.equal(validateRecord(invalid).valid, false, `${name} must enforce its standard OTel value domain`);
  }
});

test("C06 model attribution binds to an accepted Delivery root in the same trace", () => {
  const model = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records[1];
  assert.equal(admitBatch([model]).dispositions[0].disposition, "REJECTED");
  const root = structuredClone(model);
  root.span_id = "1111111111111111";
  root.span_name = "invoke_workflow delivery-1";
  root.attributes = {
    "agentops.delivery.id": "delivery-1",
    "agentops.workflow.id": "workflow-1",
    "agentops.workflow.version": "1",
    "agentops.implementation.id": "implementation-1",
    "agentops.runtime.id": model.attributes["agentops.runtime.id"],
    "agentops.manifest.digest": "a".repeat(64),
    "agentops.workflow.family": "implementation"
  };
  assert.deepEqual(admitBatch([root, model]).dispositions.map(item => item.disposition), ["ACCEPTED", "ACCEPTED"]);
  const mismatched = structuredClone(model);
  mismatched.attributes["agentops.runtime.id"] = "different-runtime";
  assert.deepEqual(admitBatch([root, mismatched]).dispositions.map(item => item.disposition), ["ACCEPTED", "REJECTED"]);
});

test("same-batch and cross-request Event/Span identity use identity plus canonical digest", () => {
  const event = JSON.parse(readFileSync(join(ROOT, "fixtures", "sampling", "default-head.json"), "utf8")).input.records[0];
  const eventBatch = admitBatch([event, structuredClone(event)]);
  assert.deepEqual(eventBatch.dispositions.map(item => item.disposition), ["ACCEPTED", "DUPLICATE"]);

  const changedEvent = structuredClone(event);
  changedEvent.attributes["agentops.sampling.decision"] = "DROP";
  const conflictBatch = admitBatch([event, changedEvent]);
  assert.deepEqual(conflictBatch.dispositions.map(item => item.disposition), ["ACCEPTED", "CONFLICT"]);

  const [root, span] = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records;
  const state = { events: new Map(), spans: new Map(), findings: new Map() };
  assert.deepEqual(admitBatch([root, span], state).dispositions.map(item => item.disposition), ["ACCEPTED", "ACCEPTED"]);
  assert.equal(admitBatch([structuredClone(span)], state).dispositions[0].disposition, "DUPLICATE");
  const changedSpan = structuredClone(span);
  changedSpan.attributes["gen_ai.request.model"] = "different-model";
  assert.equal(admitBatch([changedSpan], state).dispositions[0].disposition, "CONFLICT");
});

test("internal dispositions map uniquely to signal-specific OTLP and HTTP outcomes", () => {
  assert.deepEqual(mapOtlpOutcome("traces", []), { http_status: 200, kind: "FULL_SUCCESS", partial_success: "UNSET" });
  assert.deepEqual(mapOtlpOutcome("logs", ["ACCEPTED", "DUPLICATE"]), { http_status: 200, kind: "FULL_SUCCESS", partial_success: "UNSET" });
  assert.deepEqual(mapOtlpOutcome("traces", ["ACCEPTED", "CONFLICT", "REJECTED"]), {
    http_status: 200, kind: "PARTIAL_SUCCESS", rejected_field: "rejected_spans", rejected_items: 2
  });
  assert.deepEqual(mapOtlpOutcome("logs", ["CONFLICT", "REJECTED"]), {
    http_status: 400, kind: "PROTOBUF_STATUS", rejected_items: 2
  });
  assert.deepEqual(mapOtlpOutcome("traces", [], { kind: "OVERSIZE" }), { http_status: 413, kind: "PROTOBUF_STATUS" });
  assert.deepEqual(mapOtlpOutcome("logs", [], { kind: "OVERLOAD" }), { http_status: 429, kind: "PROTOBUF_STATUS" });
  for (const [kind, status] of [["DECODE",400],["CONTENT_TYPE",400],["UNSUPPORTED_PROFILE",400],["GLOBAL_BATCH",400],["UNAVAILABLE",503],["GATEWAY",502],["TIMEOUT",504]]) {
    assert.deepEqual(mapOtlpOutcome("logs", [], { kind }), { http_status: status, kind: "PROTOBUF_STATUS" });
  }
});

test("official OTLP protobuf Trace and Log fixture bytes decode through the pinned signal paths", () => {
  assert.deepEqual(decodeOtlpRequest("traces", Buffer.alloc(0)), { signal: "traces", path: "/v1/traces", record_count: 0, records: [] });
  for (const name of ["official-trace-protobuf.json", "official-log-protobuf.json"]) {
    const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", name), "utf8"));
    const decoded = decodeOtlpRequest(fixture.input.otlp_protobuf.signal, Buffer.from(fixture.input.otlp_protobuf.base64, "base64"));
    assert.equal(decoded.record_count, 1);
    assert.equal(decoded.path, fixture.input.otlp_protobuf.path);
    assert.equal(decoded.records.length, 1);
    assert.equal(validateRecord(decoded.records[0]).valid, true);
  }
  const traceFixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "official-trace-protobuf.json"), "utf8"));
  assert.throws(() => decodeOtlpRequest("logs", Buffer.from(traceFixture.input.otlp_protobuf.base64, "base64")));
  assert.throws(() => decodeOtlpRequest("traces", Buffer.from([0x09])), /truncated/);
});

test("compatibility is an exact closed release matrix, never inferred from SemVer", () => {
  const matrix = JSON.parse(readFileSync(join(ROOT, "registries", "compatibility-matrix-1.0.0.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "compatibility-matrix-1.0.0.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true, allErrors: true }).compile(schema)(matrix), true);
  assert.equal(matrix.default, "FAIL_CLOSED");
  assert.equal(matrix.semver_inference, false);
  assert.deepEqual(matrix.entries, [{
    producer_revision: "observation-contract@1.0.0",
    acceptor_revision: "observation-contract@1.0.0",
    profile_version: "1.0.0",
    family_schemas: ["implementation@1", "system-design@1"],
    evidence: ["fixtures/positive/official-trace-protobuf.json", "fixtures/positive/official-log-protobuf.json"]
  }]);
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
  assert.deepEqual(Object.keys(record.release_binding).sort(), ["coordinate", "machine_package", "superproject"]);
  assert.match(record.release_binding.superproject.revision, /^sha256:[a-f0-9]{64}$/);
  assert.match(record.release_binding.machine_package.revision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(record.release_binding.machine_package.gitlink_path, "system-contracts");
  const revision = entries => `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
  assert.equal(record.release_binding.superproject.revision, revision(record.semantic));
  assert.equal(record.release_binding.machine_package.revision, revision(record.artifacts));
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
