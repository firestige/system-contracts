const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { join, relative } = require("node:path");
const test = require("node:test");
const Ajv = require("ajv");
const otlp = require("./otlp-protobuf.cjs");
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
  "compatibility-matrix-1.0.1.schema.json",
  "compatibility-matrix-1.0.2.schema.json",
  "delivery-manifest-0.1.0.schema.json",
  "delivery-lifecycle-result-0.1.0.schema.json",
  "observation-record-1.0.0.schema.json",
  "otlp-interaction-1.0.0.schema.json",
  "implementation-family-1.schema.json",
  "system-design-family-1.schema.json",
  "fixture-case-0.1.0.schema.json",
  "publication-record-0.1.0.schema.json",
  "publication-record-0.1.1.schema.json",
  "publication-record-0.1.2.schema.json"
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

test("Span and Link flags admit the full OTLP fixed32 reader range", () => {
  const root = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records[0];
  for (const flags of [0x101, 0x301, 0xffffffff]) {
    const forwarded = structuredClone(root);
    forwarded.span_flags = flags;
    assert.equal(validateRecord(forwarded).valid, true, `Span flags ${flags} must be admitted`);
  }
  const linked = structuredClone(root);
  linked.span_links = [{ trace_id: "2".repeat(32), span_id: "2".repeat(16), flags: 0xffffffff }];
  assert.equal(validateRecord(linked).valid, true, "Link fixed32 flags must be admitted");

  const spanOverflow = structuredClone(root);
  spanOverflow.span_flags = 0x100000000;
  assert.equal(validateRecord(spanOverflow).valid, false, "Span flags above fixed32 must reject");
  const linkOverflow = structuredClone(root);
  linkOverflow.span_links = [{ trace_id: "2".repeat(32), span_id: "2".repeat(16), flags: 0x100000000 }];
  assert.equal(validateRecord(linkOverflow).valid, false, "Link flags above fixed32 must reject");
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

test("one request is homogeneous by exact workflow family/schema group", () => {
  const implementation = JSON.parse(readFileSync(join(ROOT, "fixtures", "negative", "unknown-field.json"), "utf8")).input.records[0];
  delete implementation.attributes["agentops.unknown"];
  const systemDesign = structuredClone(implementation);
  systemDesign.attributes["agentops.event.id"] = "event-system-design";
  systemDesign.attributes["agentops.workflow.family"] = "system-design";
  systemDesign.attributes["agentops.family.schema"] = "system-design@1";
  assert.equal(validateRecord(implementation).valid, true);
  assert.equal(validateRecord(systemDesign).valid, true);
  assert.equal(validateBatch([implementation, systemDesign]).decision, "REJECT");
  assert.equal(validateBatch([implementation], { familySchema: "system-design@1" }).decision, "REJECT");
  assert.equal(validateBatch([implementation], { familySchema: "implementation@1" }).decision, "ACCEPT");

  const [root, model] = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records;
  const state = { events: new Map(), spans: new Map(), findings: new Map() };
  assert.equal(validateBatch([root], { familySchema: "implementation@1", state }).decision, "ACCEPT");
  assert.equal(
    validateBatch([model], { familySchema: "system-design@1", state }).decision,
    "REJECT",
    "a model-only request must inherit and match the accepted Delivery root family"
  );
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
  root.span_kind = "INTERNAL";
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

test("decoded native Span carrier participates in complete identity and conflict", () => {
  const [root, model] = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records;
  assert.equal(validateRecord(root).valid, true);
  assert.equal(validateRecord(model).valid, true);
  const missingKind = structuredClone(model);
  delete missingKind.span_kind;
  assert.equal(validateRecord(missingKind).valid, false);
  for (const field of ["start_time_unix_nano", "end_time_unix_nano", "span_flags", "span_links", "span_status"]) {
    const incompleteRoot = structuredClone(root);
    delete incompleteRoot[field];
    assert.equal(validateRecord(incompleteRoot).valid, false, `decoded Span requires ${field}`);
  }

  const changed = structuredClone(model);
  changed.end_time_unix_nano = "3000000";
  changed.parent_span_id = "3333333333333333";
  changed.span_links = [{ trace_id: "44444444444444444444444444444444", span_id: "5555555555555555", flags: 1 }];
  changed.span_status = "ERROR";
  const first = decodeOtlpRequest("traces", otlp.encode("traces", [root, model]));
  const second = decodeOtlpRequest("traces", otlp.encode("traces", [root, changed]));
  assert.deepEqual({
    kind: second.records[1].span_kind,
    start: second.records[1].start_time_unix_nano,
    end: second.records[1].end_time_unix_nano,
    parent: second.records[1].parent_span_id,
    links: second.records[1].span_links,
    status: second.records[1].span_status
  }, {
    kind: "CLIENT",
    start: "1500000",
    end: "3000000",
    parent: "3333333333333333",
    links: [{ trace_id: "44444444444444444444444444444444", span_id: "5555555555555555", flags: 1 }],
    status: "ERROR"
  });
  assert.notDeepEqual(first.records[1], second.records[1]);
  const state = { events: new Map(), spans: new Map(), findings: new Map() };
  assert.deepEqual(admitBatch(first.records, state).dispositions.map(item => item.disposition), ["ACCEPTED", "ACCEPTED"]);
  assert.deepEqual(admitBatch(second.records, state).dispositions.map(item => item.disposition), ["DUPLICATE", "CONFLICT"]);
});

test("decoded protobuf preserves and rejects unknown native Span Status codes per record", () => {
  const [root, model] = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records;
  const invalidStatusBytes = otlp.encode("traces", [root, { ...model, span_status: "ERROR" }]);
  const statusEncoding = Buffer.from([0x7a, 0x02, 0x18, 0x02]);
  const statusOffset = invalidStatusBytes.lastIndexOf(statusEncoding);
  assert.notEqual(statusOffset, -1, "fixture must carry an explicit ERROR Status code");
  invalidStatusBytes[statusOffset + 3] = 99;
  const decoded = decodeOtlpRequest("traces", invalidStatusBytes, { familySchema: "implementation@1" });
  assert.equal(decoded.records[1].span_status, 99, "unknown Status must not collapse to UNSET");
  assert.equal(decoded.decision, "PARTIAL_SUCCESS");
  assert.deepEqual(decoded.dispositions.map(item => item.disposition), ["ACCEPTED", "REJECTED"]);
});

test("decoded protobuf profile failures preserve valid sibling admission", () => {
  const [root, model] = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records;
  const invalidModel = structuredClone(model);
  invalidModel.span_kind = "INTERNAL";
  const decoded = decodeOtlpRequest("traces", otlp.encode("traces", [root, invalidModel]), { familySchema: "implementation@1" });
  assert.equal(decoded.decision, "PARTIAL_SUCCESS");
  assert.deepEqual(decoded.dispositions.map(item => item.disposition), ["ACCEPTED", "REJECTED"]);

  const invalidStatusMessage = structuredClone(model);
  invalidStatusMessage.span_status_message = "prohibited-free-form-message";
  const statusDecoded = decodeOtlpRequest("traces", otlp.encode("traces", [root, invalidStatusMessage]), { familySchema: "implementation@1" });
  assert.equal(statusDecoded.decision, "PARTIAL_SUCCESS");
  assert.deepEqual(statusDecoded.dispositions.map(item => item.disposition), ["ACCEPTED", "REJECTED"]);
});

test("decoded protobuf requests share cross-request Delivery-root admission state", () => {
  const [root, model] = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "model-span.json"), "utf8")).input.records;
  const state = { events: new Map(), spans: new Map(), findings: new Map() };
  const rootResult = decodeOtlpRequest("traces", otlp.encode("traces", [root]), { familySchema: "implementation@1", state });
  assert.equal(rootResult.decision, "ACCEPT");
  assert.equal(state.deliveryRoots?.size, 1);
  const modelResult = decodeOtlpRequest("traces", otlp.encode("traces", [model]), { familySchema: "implementation@1", state });
  assert.equal(modelResult.decision, "ACCEPT");
  assert.equal(modelResult.dispositions[0].disposition, "ACCEPTED");
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
  assert.deepEqual(decodeOtlpRequest("traces", Buffer.alloc(0)), { signal: "traces", path: "/v1/traces", record_count: 0, records: [], decision: "ACCEPT", dispositions: [] });
  for (const name of ["official-trace-protobuf.json", "official-log-protobuf.json"]) {
    const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", name), "utf8"));
    const decoded = decodeOtlpRequest(fixture.input.otlp_protobuf.signal, Buffer.from(fixture.input.otlp_protobuf.base64, "base64"), { familySchema: fixture.input.otlp_protobuf.family_schema });
    assert.equal(decoded.record_count, name.startsWith("official-trace") ? 2 : 1);
    assert.equal(decoded.path, fixture.input.otlp_protobuf.path);
    assert.equal(decoded.records.length, decoded.record_count);
    assert.ok(decoded.records.every(record => validateRecord(record).valid));
    assert.equal(decoded.decision, "ACCEPT");
    assert.ok(decoded.dispositions.every(item => ["ACCEPTED", "DUPLICATE"].includes(item.disposition)));
  }
  const traceFixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "positive", "official-trace-protobuf.json"), "utf8"));
  assert.throws(() => decodeOtlpRequest("logs", Buffer.from(traceFixture.input.otlp_protobuf.base64, "base64")));
  assert.throws(() => decodeOtlpRequest("traces", Buffer.from([0x09])), /truncated/);
});

test("compatibility is an exact closed release matrix, never inferred from SemVer", () => {
  const matrix = JSON.parse(readFileSync(join(ROOT, "registries", "compatibility-matrix-1.0.2.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "compatibility-matrix-1.0.2.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true, allErrors: true }).compile(schema)(matrix), true);
  assert.equal(matrix.default, "FAIL_CLOSED");
  assert.equal(matrix.semver_inference, false);
  assert.deepEqual(matrix.entries.map(({ producer_revision, acceptor_revision, profile_version }) => ({ producer_revision, acceptor_revision, profile_version })), [
    { producer_revision: "observation-contract@1.0.0", acceptor_revision: "observation-contract@1.0.2", profile_version: "1.0.0" },
    { producer_revision: "observation-contract@1.0.1", acceptor_revision: "observation-contract@1.0.2", profile_version: "1.0.0" },
    { producer_revision: "observation-contract@1.0.2", acceptor_revision: "observation-contract@1.0.2", profile_version: "1.0.0" }
  ]);
});

test("historical publication record remains valid for the frozen 1.0.0 release", () => {
  const policy = readFileSync(join(ROOT, "VERSION_POLICY.md"), "utf8");
  assert.match(policy, /Observation Contract\/Profile `0\.3\.0`.*NON_RESOLVING_LEGACY_HISTORY_ONLY/s);
  const record = JSON.parse(readFileSync(join(ROOT, "publication", "publication-record-1.0.0.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-0.1.0.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true }).compile(schema)(record), true);
  assert.equal(record.profile_version, "1.0.0");
  assert.equal(record.status, "PUBLISHED");
  assert.equal(record.published, true);
  assert.equal(record.conformance_claim, "VALIDATOR_ONLY");
  assert.ok(Object.values(record.gates).every(value => value.startsWith("PASS_") || value.startsWith("https://github.com/")));
  assert.deepEqual(Object.keys(record.release_binding).sort(), ["coordinate", "machine_package", "superproject"]);
  assert.match(record.release_binding.superproject.revision, /^sha256:[a-f0-9]{64}$/);
  assert.match(record.release_binding.machine_package.revision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(record.release_binding.machine_package.gitlink_path, "system-contracts");
  assert.deepEqual(record.semantic.map(item => item.path), [
    "docs/agent-architecture.md",
    "docs/systems/execution/project-execution-system.md",
    "docs/systems/evidence/evidence-system.md",
    "docs/contracts/observation/observation-catalog.md",
    "docs/contracts/observation/otel-observation-profile.md",
    "docs/contracts/execution-evidence/interaction-contract.md"
  ]);
});

test("published Observation 1.0.0 record remains byte-identical", () => {
  const recordPath = join(ROOT, "publication", "publication-record-1.0.0.json");
  const bytes = readFileSync(recordPath);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "04a4658118ebbb31507eae56f0300ab1035fb7b369ee9b7301dbae3b5a519755"
  );
  const record = JSON.parse(bytes);
  assert.equal(record.release_binding.coordinate, "observation-contract@1.0.0");
  assert.equal(record.release_binding.superproject.revision, "sha256:1a3fea6d202bf08a36aaf76abc3c6601fa71dc6c581715f9c74d11456f2ae735");
  assert.equal(record.release_binding.machine_package.revision, "sha256:cf5b6c54af452085f66cf3c28b7ffb14e58451b926a97fa317b9a92a18c8d774");
});

test("published Observation 1.0.1 record remains byte-identical", () => {
  const recordPath = join(ROOT, "publication", "publication-record-1.0.1.json");
  const bytes = readFileSync(recordPath);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "971b60b7a5c436342a17474b0c70a610afcfe0d80077f0e5ce84b026dd4d207a"
  );
  const record = JSON.parse(bytes);
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-0.1.1.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true }).compile(schema)(record), true);
  assert.equal(record.record_version, "0.1.1");
  assert.equal(record.contract_revision, "observation-contract@1.0.1");
  assert.equal(record.release_binding.coordinate, "observation-contract@1.0.1");
  assert.equal(record.status, "PUBLISHED");
  assert.equal(record.published, true);
  assert.equal(record.conformance_claim, "VALIDATOR_ONLY");
  assert.match(record.gates.owner_approval, /^https:\/\/github\.com\/firestige\/workflow-self-recursive\/issues\/78#issuecomment-/);
});

test("Observation 1.0.2 is the current non-semantic binding publication", () => {
  const record = JSON.parse(readFileSync(join(ROOT, "publication", "publication-record-1.0.2.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "publication-record-0.1.2.schema.json"), "utf8"));
  assert.equal(new Ajv({ strict: true }).compile(schema)(record), true);
  assert.equal(record.record_version, "0.1.2");
  assert.equal(record.contract_revision, "observation-contract@1.0.2");
  assert.equal(record.profile_version, "1.0.0", "the patch repairs exact binding without changing the wire profile coordinate");
  assert.equal(record.release_binding.coordinate, "observation-contract@1.0.2");
  assert.equal(record.status, "PUBLISHED");
  assert.equal(record.published, true);
  assert.equal(record.conformance_claim, "VALIDATOR_ONLY");
  assert.match(record.gates.owner_approval, /^https:\/\/github\.com\/firestige\/workflow-self-recursive\/issues\/78#issuecomment-/);
  const revision = entries => `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
  assert.equal(record.release_binding.superproject.revision, revision(record.semantic));
  assert.equal(record.release_binding.machine_package.revision, revision(record.artifacts));
  function walk(directory) {
    return readdirSync(directory).sort().flatMap(name => {
      const path = join(directory, name);
      const rel = relative(ROOT, path);
      if (rel === "node_modules" || rel.startsWith("node_modules/") || rel === ".gitignore" || rel === "publication/publication-record-1.0.2.json") return [];
      return statSync(path).isDirectory() ? walk(path) : [rel];
    });
  }
  assert.deepEqual(record.artifacts.map(artifact => artifact.path), walk(ROOT));
  for (const artifact of record.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(join(ROOT, artifact.path))).digest("hex"), artifact.sha256, artifact.path);
  }
});

test("parent release binding resolves the exact Observation 1.0.2 publication", (context) => {
  const bindingPath = join(ROOT, "..", "..", "docs", "contracts", "observation", "release-binding-1.0.2.json");
  if (!existsSync(bindingPath)) { context.skip("standalone checkout has no parent 1.0.2 release binding"); return; }
  const binding = JSON.parse(readFileSync(bindingPath, "utf8"));
  const recordPath = join(ROOT, "publication", "publication-record-1.0.2.json");
  const matrixPath = join(ROOT, "registries", "compatibility-matrix-1.0.2.json");
  const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  assert.equal(binding.coordinate, "observation-contract@1.0.2");
  assert.equal(binding.superproject.content_revision, record.release_binding.superproject.revision);
  assert.deepEqual(binding.superproject.semantic, record.semantic);
  assert.equal(binding.machine_package.content_revision, record.release_binding.machine_package.revision);
  assert.equal(binding.machine_package.publication_record.path, "observation/publication/publication-record-1.0.2.json");
  assert.equal(binding.machine_package.publication_record.sha256, digest(recordPath));
  assert.equal(binding.machine_package.compatibility_matrix.path, "observation/registries/compatibility-matrix-1.0.2.json");
  assert.equal(binding.machine_package.compatibility_matrix.sha256, digest(matrixPath));
});
