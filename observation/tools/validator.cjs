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
const otlp = require("./otlp-protobuf.cjs");
const allowed = new Map(Object.values(registry.fields).flat().map(field => [field.name, field]));
const namesById = new Map(Object.values(registry.fields).flat().map(field => [field.id, field.name]));
const common = new Set(registry.fields.common.map(field => field.name));
const implementation = new Set(registry.fields.implementation.map(field => field.name));
const systemDesign = new Set(registry.fields.system_design.map(field => field.name));
const standard = new Set(["gen_ai.operation.name","gen_ai.agent.id","gen_ai.agent.name","gen_ai.agent.version","gen_ai.provider.name","gen_ai.request.model","gen_ai.response.model","gen_ai.tool.name","gen_ai.tool.type","gen_ai.tool.call.id","gen_ai.usage.input_tokens","gen_ai.usage.output_tokens","error.type"]);
const standardTypes = new Map([
  ...["gen_ai.operation.name","gen_ai.agent.id","gen_ai.agent.name","gen_ai.agent.version","gen_ai.provider.name","gen_ai.request.model","gen_ai.response.model","gen_ai.tool.name","gen_ai.tool.type","gen_ai.tool.call.id","error.type"].map(name => [name, "nonempty-string"]),
  ["gen_ai.usage.input_tokens", "nonnegative-integer"],
  ["gen_ai.usage.output_tokens", "nonnegative-integer"]
]);
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
    if (standardTypes.get(name) === "nonempty-string" && !(typeof value === "string" && value.length > 0 && value.length <= 128)) fail(errors, `wrong type or bound for ${name}`);
    if (standardTypes.get(name) === "nonnegative-integer" && !(Number.isInteger(value) && value >= 0)) fail(errors, `wrong type or bound for ${name}`);
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
    if (deliveryRoot && record.span_kind !== "INTERNAL") fail(errors, "Delivery root must use INTERNAL Span kind");
    if (a["gen_ai.operation.name"] === "invoke_agent" && !Object.hasOwn(a, "gen_ai.agent.id")) fail(errors, "incomplete Agent Span");
    if (a["gen_ai.operation.name"] === "invoke_agent" && record.span_kind !== "INTERNAL") fail(errors, "Agent Span must use INTERNAL kind");
    if (["chat","generate_content"].includes(a["gen_ai.operation.name"]) && !present(a, ["gen_ai.provider.name","gen_ai.request.model"])) fail(errors, "incomplete model Span");
    if (["chat","generate_content"].includes(a["gen_ai.operation.name"])) {
      if (record.span_kind !== "CLIENT") fail(errors, "model Span must use CLIENT kind");
      if (!(record.start_time_unix_nano && record.end_time_unix_nano)) fail(errors, "model Span requires native start/end time");
      else if (BigInt(record.end_time_unix_nano) < BigInt(record.start_time_unix_nano)) fail(errors, "model Span end precedes start");
    }
    if (a["gen_ai.operation.name"] === "execute_tool" && !present(a, ["gen_ai.tool.name","gen_ai.tool.type","gen_ai.tool.call.id"])) fail(errors, "incomplete tool Span");
    if (a["gen_ai.operation.name"] === "execute_tool" && record.span_kind !== "INTERNAL") fail(errors, "tool Span must use INTERNAL kind");
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
    const fixFields = ["agentops.fix.id","agentops.fix.finding.id"];
    const recheckFields = ["agentops.recheck.id","agentops.recheck.review.id","agentops.recheck.finding.id","agentops.recheck.fix.id","agentops.iteration.id","agentops.recheck.role.id","agentops.recheck.invocation.id"];
    if (fix && recheck) fail(errors, "Fix and Recheck compositions are mutually exclusive");
    if (!fix && !absent(a, fixFields)) fail(errors, "incomplete Fix composition");
    if (!recheck && !absent(a, recheckFields)) fail(errors, "incomplete Recheck composition");
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

function validateBatch(records, { encodedBytes, familySchema, state } = {}) {
  if (records.length > registry.limits.batch.max_records || (encodedBytes !== undefined && encodedBytes > registry.limits.batch.max_bytes)) {
    return { decision: "REJECT", accepted: 0, rejected: records.length, dispositions: records.map((_, index) => ({ index, disposition: "REJECTED", errors: ["batch limit exceeded"] })) };
  }
  const familyGroups = new Set(records.map(record => {
    if (record.record_type === "event") return record.attributes?.["agentops.family.schema"];
    if (record.span_name?.startsWith("invoke_workflow")) return { implementation: "implementation@1", "system-design": "system-design@1" }[record.attributes?.["agentops.workflow.family"]];
  }).filter(Boolean));
  if (familyGroups.size > 1 || (familySchema && familyGroups.size === 1 && !familyGroups.has(familySchema))) return { decision: "REJECT", accepted: 0, rejected: records.length, dispositions: records.map((_, index) => ({ index, disposition: "REJECTED", errors: ["request conflicts with its homogeneous workflow family/schema group"] })) };
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
  state.deliveryRoots ||= new Map();
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
    if (record.record_type === "span" && record.span_name.startsWith("invoke_workflow")) {
      const rootBinding = canonical([a["agentops.delivery.id"],a["agentops.runtime.id"],a["agentops.manifest.digest"]]);
      if (state.deliveryRoots.has(record.trace_id) && state.deliveryRoots.get(record.trace_id) !== rootBinding) return { disposition: "CONFLICT", errors: ["Delivery root binding conflict"] };
      state.deliveryRoots.set(record.trace_id, rootBinding);
    }
    if (record.record_type === "span" && Object.hasOwn(a, "agentops.model.id")) {
      const rootBinding = state.deliveryRoots.get(record.trace_id);
      if (!rootBinding) return { disposition: "REJECTED", errors: ["model attribution has no accepted Delivery root in its trace"] };
      const [, runtimeId] = JSON.parse(rootBinding);
      if (runtimeId !== a["agentops.runtime.id"]) return { disposition: "REJECTED", errors: ["model attribution C06 differs from Delivery root"] };
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
      const fixKey = canonical([edge,fixId]);
      const contribution = canonical([edge,a["agentops.fix.finding.id"],a["agentops.review.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"]]);
      if (finding.fixes.has(fixKey) && finding.fixes.get(fixKey) !== contribution) return { disposition: "CONFLICT", errors: ["Fix contribution conflict"] };
    }
    if (Object.hasOwn(a, "agentops.recheck.id")) {
      const recheckId = a["agentops.recheck.id"];
      const recheckKey = canonical([edge,recheckId]);
      const fixId = a["agentops.recheck.fix.id"];
      if (fixId && !finding.fixes.has(canonical([edge,fixId]))) return { disposition: "REJECTED", errors: ["Recheck selects an unaccepted Fix for the target edge"] };
      const contribution = canonical([edge,a["agentops.recheck.review.id"],a["agentops.recheck.finding.id"],fixId,a["agentops.iteration.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"],a["agentops.recheck.role.id"],a["agentops.recheck.invocation.id"]]);
      if (finding.rechecks.has(recheckKey) && finding.rechecks.get(recheckKey) !== contribution) return { disposition: "CONFLICT", errors: ["Recheck contribution conflict"] };
    }
    if (!lifecycle) finding.targets.set(targetId, edge);
    finding.statuses.set(statusKey, status);
    if (Object.hasOwn(a, "agentops.fix.id")) finding.fixes.set(canonical([edge,a["agentops.fix.id"]]), canonical([edge,a["agentops.fix.finding.id"],a["agentops.review.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"]]));
    if (Object.hasOwn(a, "agentops.recheck.id")) finding.rechecks.set(canonical([edge,a["agentops.recheck.id"]]), canonical([edge,a["agentops.recheck.review.id"],a["agentops.recheck.finding.id"],a["agentops.recheck.fix.id"],a["agentops.iteration.id"],a["agentops.writer.role.id"],a["agentops.writer.invocation.id"],a["agentops.reviewer.role.id"],a["agentops.reviewer.invocation.id"],a["agentops.recheck.role.id"],a["agentops.recheck.invocation.id"]]));
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

function validateInteractionContract(interaction) {
  const errors = [];
  if (!validateInteraction(interaction)) return { valid: false, errors: validateInteraction.errors.map(error => `${error.instancePath} ${error.message}`) };
  const rejected = interaction.transport_result.rejected_spans ?? interaction.transport_result.rejected_log_records;
  if (rejected !== undefined && rejected >= interaction.request.record_count) fail(errors, "HTTP 200 partial success rejected count must be less than request record count");
  return { valid: errors.length === 0, errors };
}

function decodeOtlpRequest(signal, bytes, { familySchema } = {}) {
  if (bytes.length > registry.limits.batch.max_bytes) throw new Error("OTLP protobuf request exceeds batch byte limit");
  const records = otlp.decode(signal, bytes);
  if (records.length > registry.limits.batch.max_records) throw new Error("OTLP protobuf request exceeds record limit");
  for (const record of records) {
    const result = validateRecord(record);
    if (!result.valid) throw new Error(`decoded ${signal} record fails Observation profile admission: ${result.errors.join("; ")}`);
  }
  const admitted = validateBatch(records, { encodedBytes: bytes.length, familySchema });
  return { signal, path: signal === "traces" ? "/v1/traces" : "/v1/logs", record_count: records.length, records, decision: admitted.decision, dispositions: admitted.dispositions };
}

function evaluateFixture(fixture) {
  if (fixture.input.interaction) return validateInteractionContract(fixture.input.interaction).valid ? "ACCEPT" : "REJECT";
  if (fixture.input.otlp_protobuf) {
    try {
      const decoded = decodeOtlpRequest(fixture.input.otlp_protobuf.signal, Buffer.from(fixture.input.otlp_protobuf.base64, "base64"), { familySchema: fixture.input.otlp_protobuf.family_schema });
      return decoded.dispositions.some(item => ["CONFLICT", "REJECTED"].includes(item.disposition)) ? "REJECT" : "ACCEPT";
    }
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

module.exports = { admitBatch, ajv, canonical, canonicalDigest, decodeOtlpRequest, evaluateFixture, load, mapOtlpOutcome, registry, validateBatch, validateInteractionContract, validateLifecycle, validateManifest, validateRecord, validateSequence };
