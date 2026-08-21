const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");
const Ajv = require("ajv");

const ROOT = join(__dirname, "..");
const load = path => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const registry = load("registries/observation-profile-1.0.0.json");
const ajv = new Ajv({ strict: true, allErrors: true });
const validateRecordShape = ajv.compile(load("schemas/observation-record-1.0.0.schema.json"));
const validateManifest = ajv.compile(load("schemas/delivery-manifest-0.1.0.schema.json"));
const validateLifecycle = ajv.compile(load("schemas/delivery-lifecycle-result-0.1.0.schema.json"));
const validateInteraction = ajv.compile(load("schemas/otlp-interaction-1.0.0.schema.json"));
const allowed = new Map(Object.values(registry.fields).flat().map(field => [field.name, field]));
const namesById = new Map(Object.values(registry.fields).flat().map(field => [field.id, field.name]));
const common = new Set(registry.fields.common.map(field => field.name));
const implementation = new Set(registry.fields.implementation.map(field => field.name));
const systemDesign = new Set(registry.fields.system_design.map(field => field.name));
const standard = new Set(["gen_ai.operation.name","gen_ai.agent.id","gen_ai.agent.name","gen_ai.agent.version","gen_ai.provider.name","gen_ai.request.model","gen_ai.response.model","gen_ai.tool.name","gen_ai.tool.type","gen_ai.tool.call.id","gen_ai.usage.input_tokens","gen_ai.usage.output_tokens","error.type"]);
const enums = new Map(Object.entries({
  "agentops.workflow.family": ["implementation", "system-design"],
  "agentops.delivery.outcome": ["COMPLETED", "INCOMPLETE", "FAILED", "CANCELLED", "START_FAILED"],
  "agentops.summary.state": ["FINAL", "LOWER_BOUND", "NOT_APPLICABLE", "UNAVAILABLE"],
  "agentops.review.lens": ["GOAL_BLACKBOX", "IMPLEMENTATION_WHITEBOX", "ARCHITECTURE", "PROBLEM_SOLUTION", "QUALITY_ACCEPTANCE", "FRESH_READER"],
  "agentops.review.severity": ["BLOCKING", "MAJOR", "MINOR"],
  "agentops.finding.status": ["OPEN", "CLOSED_FIXED", "CLOSED_NOT_VALID", "ACCEPTED_MINOR"],
  "agentops.intervention.kind": ["USER_REDIRECT"],
  "agentops.usage.kind": ["native_credit", "request", "premium_request", "provider_native", "money"],
  "agentops.usage.source": ["runtime", "provider"],
  "agentops.sampling.decision": ["RECORD_AND_SAMPLE", "DROP"],
  "agentops.family.schema": ["implementation@1", "system-design@1"],
  "agentops.finding.target.kind": ["ARTIFACT", "SECTION", "COMPONENT", "REQUIREMENT"],
  "agentops.coverage.dimension": ["line", "branch", "function"],
  "agentops.fresh_reader.result": ["PASS", "FINDINGS_REPORTED"],
  "agentops.verification.result": ["PASS", "FAIL", "INCONCLUSIVE", "KNOWN_RED_NO_DELTA"]
}));

function present(attributes, names) { return names.every(name => Object.hasOwn(attributes, name)); }
function absent(attributes, names) { return names.every(name => !Object.hasOwn(attributes, name)); }
function fail(errors, message) { errors.push(message); }
function fieldNames(ids) { return ids.map(id => namesById.get(id)); }

function validateRecord(record) {
  const errors = [];
  if (!validateRecordShape(record)) return { valid: false, errors: validateRecordShape.errors.map(error => `${error.instancePath} ${error.message}`) };
  const a = record.attributes;
  for (const [name, value] of Object.entries(a)) {
    if (name.startsWith("agentops.") && !allowed.has(name)) fail(errors, `unknown agentops field ${name}`);
    if (!name.startsWith("agentops.") && !standard.has(name)) fail(errors, `unknown standard field ${name}`);
    const field = allowed.get(name);
    if (field && (field.type === "integer" ? !Number.isInteger(value) : field.type === "number" ? typeof value !== "number" || !Number.isFinite(value) : typeof value !== field.type)) fail(errors, `wrong type for ${name}`);
    if (field?.type === "string" && value.length === 0) fail(errors, `empty ${name}`);
    if (typeof value === "string" && value.length > (name === "agentops.finding.summary" ? 512 : 128)) fail(errors, `over-limit ${name}`);
    if (enums.has(name) && !enums.get(name).includes(value)) fail(errors, `invalid enum for ${name}`);
    if (["agentops.manifest.digest", "agentops.artifact.digest"].includes(name) && !/^[a-f0-9]{64}$/.test(value)) fail(errors, `invalid digest ${name}`);
  }
  if (Object.keys(a).some(name => /prompt|completion|content|message|body/i.test(name))) fail(errors, "prohibited content-bearing attribute");
  if (record.record_type === "span") {
    const spanAllowed = new Set(fieldNames(registry.applicability.span.allowed));
    for (const name of Object.keys(a)) if (name.startsWith("agentops.") && !spanAllowed.has(name)) fail(errors, `${name} prohibited on Span`);
    const deliveryRoot = record.span_name.startsWith("invoke_workflow");
    const rootOnly = fieldNames(["C01","C02","C03","C04","C05","C07","C08"]);
    if (!deliveryRoot && !absent(a, rootOnly)) fail(errors, "Delivery-root field outside Delivery root Span");
    if (record.span_name.startsWith("invoke_workflow") && !present(a, ["agentops.delivery.id","agentops.workflow.id","agentops.workflow.version","agentops.implementation.id","agentops.runtime.id","agentops.manifest.digest","agentops.workflow.family"])) fail(errors, "incomplete Delivery root");
    if (a["gen_ai.operation.name"] === "invoke_agent" && !Object.hasOwn(a, "gen_ai.agent.id")) fail(errors, "incomplete Agent Span");
    if (["chat","generate_content"].includes(a["gen_ai.operation.name"]) && !present(a, ["gen_ai.provider.name","gen_ai.request.model"])) fail(errors, "incomplete model Span");
    if (a["gen_ai.operation.name"] === "execute_tool" && !present(a, ["gen_ai.tool.name","gen_ai.tool.type","gen_ai.tool.call.id"])) fail(errors, "incomplete tool Span");
    const standardByOperation = {
      invoke_agent: new Set(["gen_ai.operation.name","gen_ai.agent.id","gen_ai.agent.name","gen_ai.agent.version","error.type"]),
      chat: new Set(["gen_ai.operation.name","gen_ai.provider.name","gen_ai.request.model","gen_ai.response.model","gen_ai.usage.input_tokens","gen_ai.usage.output_tokens","error.type"]),
      generate_content: new Set(["gen_ai.operation.name","gen_ai.provider.name","gen_ai.request.model","gen_ai.response.model","gen_ai.usage.input_tokens","gen_ai.usage.output_tokens","error.type"]),
      execute_tool: new Set(["gen_ai.operation.name","gen_ai.tool.name","gen_ai.tool.type","gen_ai.tool.call.id","error.type"])
    };
    const permittedStandard = standardByOperation[a["gen_ai.operation.name"]] || new Set(["error.type"]);
    for (const name of Object.keys(a)) if (!name.startsWith("agentops.") && !permittedStandard.has(name)) fail(errors, `${name} prohibited for Span operation`);
    if (Object.hasOwn(a, "agentops.delivery.elapsed_time_ms") || Object.hasOwn(a, "agentops.delivery.stage.reached")) fail(errors, "Delivery summary field on Span");
    if (Object.hasOwn(a, "agentops.model.id")) {
      if (!(a["gen_ai.operation.name"] === "chat" || a["gen_ai.operation.name"] === "generate_content")) fail(errors, "model identity outside model-call Span");
      if (!(typeof a["agentops.model.id"] === "string" && a["agentops.model.id"].length > 0 && a["agentops.model.id"].length <= 128)) fail(errors, "invalid canonical model identity");
      if (!(present(a, ["agentops.model.id","agentops.role.id","agentops.runtime.id"]) && typeof a["gen_ai.provider.name"] === "string" && a["gen_ai.provider.name"].length > 0)) fail(errors, "incomplete model attribution tuple");
    }
    return { valid: errors.length === 0, errors };
  }
  if (Object.keys(a).some(name => !name.startsWith("agentops."))) fail(errors, "standard Span attribute on Event");
  if (!present(a, ["agentops.event.id"])) fail(errors, "event identity required");
  const eventRule = registry.applicability.events[record.event_name];
  const eventAllowed = new Set(fieldNames(eventRule.allowed));
  for (const name of Object.keys(a)) if (name.startsWith("agentops.") && !eventAllowed.has(name)) fail(errors, `${name} prohibited on ${record.event_name}`);
  if (!present(a, fieldNames(eventRule.required))) fail(errors, `incomplete closed field set for ${record.event_name}`);
  const familyEvents = !["sampling.decision"].includes(record.event_name);
  if (familyEvents && !present(a, ["agentops.workflow.family","agentops.family.schema"])) fail(errors, "family coordinates required");
  const family = a["agentops.workflow.family"];
  const familySchema = a["agentops.family.schema"];
  if (family === "implementation" && familySchema !== "implementation@1") fail(errors, "family/schema mismatch");
  if (family === "system-design" && familySchema !== "system-design@1") fail(errors, "family/schema mismatch");
  if (family === "implementation" && Object.keys(a).some(name => systemDesign.has(name))) fail(errors, "sibling-family field");
  if (family === "system-design" && Object.keys(a).some(name => implementation.has(name))) fail(errors, "sibling-family field");
  if (Object.hasOwn(a, "agentops.review.scope") && !/^(GOAL:[A-Za-z0-9][A-Za-z0-9._:/@-]{0,122}|WHOLE_SCOPE|SYSTEM_DESIGN)$/.test(a["agentops.review.scope"])) fail(errors, "invalid objective review scope");
  if (Object.hasOwn(a, "agentops.model.id")) fail(errors, "model identity outside model-call Span");
  if (Object.hasOwn(a, "agentops.delivery.elapsed_time_ms")) {
    if (record.event_name !== "delivery.summary") fail(errors, "Delivery elapsed time outside delivery.summary");
    if (!(typeof a["agentops.delivery.elapsed_time_ms"] === "number" && Number.isFinite(a["agentops.delivery.elapsed_time_ms"]) && a["agentops.delivery.elapsed_time_ms"] >= 0)) fail(errors, "invalid Delivery elapsed time");
  }
  if (Object.hasOwn(a, "agentops.delivery.stage.reached")) {
    if (record.event_name !== "delivery.summary") fail(errors, "Delivery reached stage outside delivery.summary");
    if (!(typeof a["agentops.delivery.stage.reached"] === "string" && a["agentops.delivery.stage.reached"].length > 0 && a["agentops.delivery.stage.reached"].length <= 128)) fail(errors, "invalid Delivery reached stage");
  }

  const required = {
    "delivery.summary": ["agentops.delivery.outcome","agentops.summary.state"],
    "review.finding": ["agentops.review.id","agentops.review.lens","agentops.review.scope","agentops.review.severity","agentops.finding.id","agentops.finding.status","agentops.source.review.id","agentops.artifact.id","agentops.artifact.digest","agentops.writer.role.id","agentops.writer.invocation.id","agentops.reviewer.role.id","agentops.reviewer.invocation.id","agentops.finding.summary","agentops.finding.scope.id","agentops.finding.target.kind","agentops.finding.target.id"],
    "review.summary": ["agentops.summary.state","agentops.review.id","agentops.review.lens","agentops.review.scope","agentops.artifact.id","agentops.artifact.digest","agentops.writer.role.id","agentops.writer.invocation.id","agentops.reviewer.role.id","agentops.reviewer.invocation.id"],
    "test.summary": ["agentops.summary.state","agentops.artifact.id","agentops.artifact.digest","agentops.test.passed","agentops.test.failed","agentops.test.skipped"],
    "role.lineage": ["agentops.role.id","agentops.role.lineage.id"],
    "intervention": ["agentops.intervention.kind"],
    "usage": ["agentops.summary.state","agentops.usage.kind","agentops.usage.unit","agentops.usage.source","agentops.usage.source.id","agentops.usage.value"],
    "sampling.decision": ["agentops.sampling.decision","agentops.sampling.probability"]
  }[record.event_name] || [];
  if (!present(a, required)) fail(errors, `incomplete ${record.event_name}`);
  if (["review.finding","review.summary"].includes(record.event_name)) {
    const recheck = Object.hasOwn(a, "agentops.recheck.id");
    if (recheck && !present(a, ["agentops.recheck.review.id","agentops.iteration.id","agentops.recheck.role.id","agentops.recheck.invocation.id"])) fail(errors, "incomplete recheck");
    if (!recheck && !absent(a, ["agentops.iteration.id"])) fail(errors, "C27 prohibited outside recheck");
    if (record.event_name === "review.finding" && Object.hasOwn(a, "agentops.review.observed.count")) fail(errors, "C17 prohibited on finding");
  }
  if (record.event_name === "review.finding") {
    const kind = a["agentops.finding.target.kind"];
    if (kind === "SECTION" && !Object.hasOwn(a, "agentops.finding.target.artifact.id")) fail(errors, "SECTION target requires containing Artifact");
    if (kind === "ARTIFACT" && Object.hasOwn(a, "agentops.finding.target.artifact.id")) fail(errors, "ARTIFACT target prohibits containing Artifact");
    const fix = Object.hasOwn(a, "agentops.fix.id");
    const recheck = Object.hasOwn(a, "agentops.recheck.id");
    if (fix && (!Object.hasOwn(a, "agentops.fix.finding.id") || a["agentops.fix.finding.id"] !== a["agentops.finding.id"])) fail(errors, "incomplete or mismatched fix edge");
    if (recheck && (!Object.hasOwn(a, "agentops.recheck.finding.id") || a["agentops.recheck.finding.id"] !== a["agentops.finding.id"] || a["agentops.recheck.review.id"] !== a["agentops.source.review.id"])) fail(errors, "mismatched recheck endpoints");
    if (!fix && !recheck && a["agentops.source.review.id"] !== a["agentops.review.id"]) fail(errors, "ordinary Finding source/current Review mismatch");
  }
  if (record.event_name === "review.summary") {
    const findingOnly = ["agentops.review.severity","agentops.finding.id","agentops.finding.status","agentops.source.review.id","agentops.finding.summary","agentops.finding.scope.id","agentops.finding.target.kind","agentops.finding.target.id","agentops.finding.target.artifact.id","agentops.fix.id","agentops.fix.finding.id"];
    if (!absent(a, findingOnly)) fail(errors, "Finding fields prohibited on Review summary");
    if (a["agentops.review.lens"] === "FRESH_READER" && !(a["agentops.family.schema"] === "system-design@1" && present(a, ["agentops.fresh_reader.result","agentops.fresh_reader.finding.count"]))) fail(errors, "incomplete Fresh Reader summary");
  }
  if (record.event_name === "implementation.summary" && Object.hasOwn(a, "agentops.coverage.dimension")) {
    if (!present(a, ["agentops.coverage.covered","agentops.coverage.total","agentops.coverage.scope","agentops.coverage.tool.id","agentops.coverage.format"])) fail(errors, "incomplete coverage fact");
    if (a["agentops.coverage.covered"] > a["agentops.coverage.total"]) fail(errors, "covered exceeds total");
  }
  if (record.event_name === "implementation.summary" && !present(a, ["agentops.summary.state","agentops.artifact.id","agentops.artifact.digest","agentops.coverage.dimension","agentops.coverage.covered","agentops.coverage.total","agentops.coverage.scope","agentops.coverage.tool.id","agentops.coverage.format"])) fail(errors, "incomplete implementation summary");
  if (record.event_name === "system_design.summary") {
    const deterministic = present(a, ["agentops.summary.state","agentops.artifact.id","agentops.artifact.digest","agentops.verification.id","agentops.verification.result","agentops.verification.check.passed","agentops.verification.check.failed"]);
    if (!deterministic) fail(errors, "incomplete deterministic verification fact");
  }
  if (a["agentops.sampling.probability"] < 0 || a["agentops.sampling.probability"] > 1) fail(errors, "sampling probability outside [0,1]");
  for (const name of fieldNames(["C16","C17","C40","C41","C46","I01","I02","I03","I04","I06","I07","S02","S05","S06"])) if (a[name] < 0) fail(errors, `negative ${name}`);
  return { valid: errors.length === 0, errors };
}

function validateBatch(records, { encodedBytes, state } = {}) {
  if (records.length > registry.limits.batch.max_records || (encodedBytes !== undefined && encodedBytes > registry.limits.batch.max_bytes)) {
    return { decision: "REJECT", accepted: 0, rejected: records.length, dispositions: records.map((_, index) => ({ index, disposition: "REJECTED", errors: ["batch limit exceeded"] })) };
  }
  for (const field of Object.values(registry.fields).flat()) {
    const values = new Set(records.filter(record => Object.hasOwn(record.attributes || {}, field.name)).map(record => canonical(record.attributes[field.name])));
    const max = field.cardinality === "BC" ? registry.limits.admission_cardinality.BC_max_distinct_per_field : field.cardinality === "HC" ? registry.limits.admission_cardinality.HC_max_distinct_per_field : Infinity;
    if (values.size > max) return { decision: "REJECT", accepted: 0, rejected: records.length, dispositions: records.map((_, index) => ({ index, disposition: "REJECTED", errors: [`cardinality budget exceeded for ${field.name}`] })) };
  }
  const admitted = admitBatch(records, state);
  const rejected = admitted.dispositions.filter(item => ["CONFLICT", "REJECTED"].includes(item.disposition)).length;
  const accepted = records.length - rejected;
  return { decision: rejected === 0 ? "ACCEPT" : accepted === 0 ? "REJECT" : "PARTIAL_SUCCESS", accepted, rejected, dispositions: admitted.dispositions };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function canonicalDigest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function createAdmissionState(state = {}) {
  state.events ||= new Map();
  state.spans ||= new Map();
  state.findings ||= new Map();
  return state;
}

function admitRecord(record, state) {
    const validation = validateRecord(record);
    if (!validation.valid) return { disposition: "REJECTED", errors: validation.errors };
    const a = record.attributes;
    const encoded = canonical(record);
    const identityIndex = record.record_type === "span" ? state.spans : state.events;
    const identity = record.record_type === "span" ? `${record.trace_id}:${record.span_id}` : a["agentops.event.id"];
    if (identityIndex.has(identity)) {
      return identityIndex.get(identity) === encoded
        ? { disposition: "DUPLICATE", errors: [] }
        : { disposition: "CONFLICT", errors: [`${record.record_type === "span" ? "Span" : "Event"} identity content conflict`] };
    }
    if (record.event_name !== "review.finding") {
      identityIndex.set(identity, encoded);
      return { disposition: "ACCEPTED", errors: [] };
    }
    const findingId = a["agentops.finding.id"];
    const targetId = a["agentops.finding.target.id"];
    const lifecycle = Object.hasOwn(a, "agentops.fix.id") || Object.hasOwn(a, "agentops.recheck.id");
    const invariant = canonical([
      a["agentops.finding.scope.id"], a["agentops.review.lens"], a["agentops.review.scope"], a["agentops.review.severity"],
      a["agentops.source.review.id"], a["agentops.family.schema"], a["agentops.finding.summary"]
    ]);
    const assertionProvenance = canonical([
      a["agentops.artifact.id"], a["agentops.artifact.digest"], a["agentops.writer.role.id"],
      a["agentops.writer.invocation.id"], a["agentops.reviewer.role.id"], a["agentops.reviewer.invocation.id"]
    ]);
    const edge = canonical([a["agentops.finding.target.kind"],targetId,a["agentops.finding.target.artifact.id"]]);
    let finding = state.findings.get(findingId);
    if (!finding) {
      if (lifecycle) return { disposition: "REJECTED", errors: ["lifecycle record precedes Finding assertion"] };
      finding = { invariant, assertionProvenance, targets: new Map(), statuses: new Map(), fixes: new Map(), rechecks: new Map() };
    } else if (finding.invariant !== invariant) return { disposition: "CONFLICT", errors: ["Finding assertion invariant conflict"] };
    if (!lifecycle && finding.assertionProvenance !== assertionProvenance) return { disposition: "CONFLICT", errors: ["Finding assertion provenance conflict"] };
    if (finding.targets.has(targetId) && finding.targets.get(targetId) !== edge) return { disposition: "CONFLICT", errors: ["Finding target endpoint conflict"] };
    if (lifecycle && !finding.targets.has(targetId)) return { disposition: "REJECTED", errors: ["lifecycle record selects an unaccepted target"] };
    const statusKey = canonical([findingId,a["agentops.finding.scope.id"],a["agentops.review.id"]]);
    const status = canonical([a["agentops.finding.status"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"]]);
    if (finding.statuses.has(statusKey) && finding.statuses.get(statusKey) !== status) return { disposition: "CONFLICT", errors: ["Finding status contribution conflict"] };
    if (Object.hasOwn(a, "agentops.fix.id")) {
      const fixId = a["agentops.fix.id"];
      const contribution = canonical([edge,a["agentops.fix.finding.id"],a["agentops.review.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"]]);
      if (finding.fixes.has(fixId) && finding.fixes.get(fixId) !== contribution) return { disposition: "CONFLICT", errors: ["Fix contribution conflict"] };
    }
    if (Object.hasOwn(a, "agentops.recheck.id")) {
      const recheckId = a["agentops.recheck.id"];
      const fixId = a["agentops.recheck.fix.id"];
      if (fixId && !finding.fixes.has(fixId)) return { disposition: "REJECTED", errors: ["Recheck selects an unaccepted Fix"] };
      const contribution = canonical([edge,a["agentops.recheck.review.id"],a["agentops.recheck.finding.id"],fixId,a["agentops.iteration.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"],a["agentops.recheck.role.id"],a["agentops.recheck.invocation.id"]]);
      if (finding.rechecks.has(recheckId) && finding.rechecks.get(recheckId) !== contribution) return { disposition: "CONFLICT", errors: ["Recheck contribution conflict"] };
    }
    if (!lifecycle) finding.targets.set(targetId, edge);
    finding.statuses.set(statusKey, status);
    if (Object.hasOwn(a, "agentops.fix.id")) finding.fixes.set(a["agentops.fix.id"], canonical([edge,a["agentops.fix.finding.id"],a["agentops.review.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"]]));
    if (Object.hasOwn(a, "agentops.recheck.id")) finding.rechecks.set(a["agentops.recheck.id"], canonical([edge,a["agentops.recheck.review.id"],a["agentops.recheck.finding.id"],a["agentops.recheck.fix.id"],a["agentops.iteration.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"],a["agentops.recheck.role.id"],a["agentops.recheck.invocation.id"]]));
    state.findings.set(findingId, finding);
    identityIndex.set(identity, encoded);
    return { disposition: "ACCEPTED", errors: [] };
}

function admitBatch(records, suppliedState) {
  const state = createAdmissionState(suppliedState);
  return { state, dispositions: records.map((record, index) => ({ index, ...admitRecord(record, state) })) };
}

function validateSequence(records) {
  const result = admitBatch(records);
  const last = result.dispositions.at(-1) || { disposition: "ACCEPTED", errors: [] };
  const decision = { ACCEPTED: "ACCEPT", DUPLICATE: "NO_OP", CONFLICT: "CONFLICT", REJECTED: "REJECT" }[last.disposition];
  if (result.dispositions.some(item => item.disposition === "REJECTED")) return { decision: "REJECT", errors: result.dispositions.flatMap(item => item.errors) };
  if (result.dispositions.some(item => item.disposition === "CONFLICT")) return { decision: "CONFLICT", errors: result.dispositions.flatMap(item => item.errors) };
  return { decision, errors: last.errors };
}

function mapOtlpOutcome(signal, dispositions, requestFailure) {
  const errors = { DECODE: 400, CONTENT_TYPE: 400, UNSUPPORTED_PROFILE: 400, GLOBAL_BATCH: 400, OVERSIZE: 413, OVERLOAD: 429, GATEWAY: 502, UNAVAILABLE: 503, TIMEOUT: 504 };
  if (requestFailure) return { http_status: errors[requestFailure.kind], kind: "PROTOBUF_STATUS" };
  const rejected = dispositions.filter(value => value === "CONFLICT" || value === "REJECTED").length;
  if (rejected === 0) return { http_status: 200, kind: "FULL_SUCCESS", partial_success: "UNSET" };
  if (rejected === dispositions.length) return { http_status: 400, kind: "PROTOBUF_STATUS", rejected_items: rejected };
  return { http_status: 200, kind: "PARTIAL_SUCCESS", rejected_field: signal === "traces" ? "rejected_spans" : "rejected_log_records", rejected_items: rejected };
}

function protobufFields(buffer) {
  const result = [];
  let offset = 0;
  const readVarint = () => { let value = 0, shift = 0, byte; do { if (offset >= buffer.length) throw new Error("truncated protobuf varint"); byte = buffer[offset++]; value += (byte & 0x7f) * 2 ** shift; shift += 7; } while (byte & 0x80); return value; };
  while (offset < buffer.length) {
    const tag = readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 2) { const length = readVarint(); const end = offset + length; if (end > buffer.length) throw new Error("truncated protobuf field"); result.push({ field, value: buffer.subarray(offset, end) }); offset = end; }
    else if (wire === 0) readVarint();
    else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw new Error(`unsupported protobuf wire type ${wire}`);
  }
  return result;
}

function decodeOtlpRequest(signal, bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("OTLP protobuf request must be bytes");
  const outer = protobufFields(bytes).filter(item => item.field === 1);
  const records = [];
  for (const resourceGroup of outer) {
    for (const scopeGroup of protobufFields(resourceGroup.value).filter(item => item.field === 2)) {
      for (const record of protobufFields(scopeGroup.value).filter(item => item.field === 2)) records.push(record.value);
    }
  }
  return { signal, path: signal === "traces" ? "/v1/traces" : "/v1/logs", record_count: records.length };
}

function evaluateFixture(fixture) {
  if (fixture.input.interaction) return validateInteraction(fixture.input.interaction) ? "ACCEPT" : "REJECT";
  if (fixture.input.otlp_protobuf) {
    try { decodeOtlpRequest(fixture.input.otlp_protobuf.signal, Buffer.from(fixture.input.otlp_protobuf.base64, "base64")); return "ACCEPT"; }
    catch { return "REJECT"; }
  }
  if (fixture.input.digest_vector) return canonicalDigest(fixture.input.digest_vector.value) === fixture.input.digest_vector.sha256 ? "ACCEPT" : "REJECT";
  if (fixture.input.manifest) return validateManifest(fixture.input.manifest) ? "ACCEPT" : "REJECT";
  if (fixture.input.lifecycle_result) {
    if (!validateLifecycle(fixture.input.lifecycle_result)) return "REJECT";
    return fixture.input.lifecycle_result.state === "RESULT_UNRESOLVED" ? "RETAIN" : "ACCEPT";
  }
  if (fixture.input.retention) return fixture.input.retention.action;
  const records = fixture.input.records || [];
  if (fixture.input.identity_sequence) return validateSequence(records).decision;
  return validateBatch(records, { encodedBytes: fixture.input.encoded_bytes }).decision;
}

module.exports = { admitBatch, ajv, canonical, canonicalDigest, decodeOtlpRequest, evaluateFixture, load, mapOtlpOutcome, registry, validateBatch, validateLifecycle, validateManifest, validateRecord, validateSequence };
