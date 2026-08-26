const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const Ajv = require("ajv");

const ROOT = join(__dirname, "..");
const SUPER = join(ROOT, "..", "..");
const load = path => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const registry = load("registries/evidence-query-0.1.0.json");
const observationRegistry = JSON.parse(readFileSync(join(ROOT, "..", "observation", "registries", "observation-profile-1.0.0.json"), "utf8"));
const ajv = new Ajv({ strict: true, allErrors: true });
const responseOracle = ajv.compile(load("schemas/evidence-query-response-0.1.0.schema.json"));
const internalOracle = ajv.compile(load("schemas/evidence-query-internal-1.0.0.schema.json"));
const fixtureOracle = ajv.compile(load("schemas/fixture-case-0.1.0.schema.json"));

const fields = Object.values(observationRegistry.fields).flat();
const fieldById = new Map(fields.map(field => [field.id, field]));
const fieldByName = new Map(fields.map(field => [field.name, field]));
const eventNames = new Set(observationRegistry.event_names);
const factKinds = new Set(registry.fact_kinds);
const traceKinds = new Set(registry.trace_kinds);
const factualKinds = factKinds;
const standardTypes = new Map([
  ...["gen_ai.operation.name", "gen_ai.agent.id", "gen_ai.agent.name", "gen_ai.agent.version", "gen_ai.provider.name", "gen_ai.request.model", "gen_ai.response.model", "gen_ai.tool.name", "gen_ai.tool.type", "gen_ai.tool.call.id", "error.type"].map(name => [name, "string"]),
  ["gen_ai.usage.input_tokens", "integer"], ["gen_ai.usage.output_tokens", "integer"]
]);
const standardFieldOrder = [...standardTypes.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const kindOrder = new Map(registry.trace_kinds.map((kind, index) => [kind, index]));
const measurementFields = new Set(["C16", "C17", "C40", "C41", "C46", "C55", "I01", "I02", "I03", "I04", "I06", "I07", "S02", "S05", "S06"]);

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function utf8Length(value) { return Buffer.byteLength(value, "utf8"); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function same(left, right) { return canonical(left) === canonical(right); }
function strictlySorted(values, compare) { return values.every((value, index) => index === 0 || compare(values[index - 1], value) < 0); }
function unique(values, key = canonical) { return new Set(values.map(key)).size === values.length; }
function validTimestamp(value) {
  if (typeof value !== "string" || !/^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{6}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 23) === `${value.slice(0, 23)}`;
}
function validateScalar(value) {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length > 0 && utf8Length(value) <= 256;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return !Number.isInteger(value) || Number.isSafeInteger(value);
}
function errorsOf(oracle) { return (oracle.errors || []).map(error => `${error.instancePath} ${error.message}`); }
function checkFields(entries, errors, { allowedIds, expired = false } = {}) {
  if (!unique(entries, entry => entry.field)) errors.push("field values must be unique");
  const rank = name => fieldById.has(name) ? [...fieldById.keys()].indexOf(name) : fields.length + standardFieldOrder.indexOf(name);
  if (!entries.every((entry, index) => index === 0 || rank(entries[index - 1].field) < rank(entry.field))) errors.push("fields are not in registry/UTF-8 order");
  if (expired && entries.length) errors.push("expired detail must have empty fields");
  for (const entry of entries) {
    const field = fieldById.get(entry.field);
    const standard = standardTypes.get(entry.field);
    if (!field && !standard) { errors.push(`unknown field ${entry.field}`); continue; }
    if (allowedIds && !allowedIds.has(entry.field)) errors.push(`field ${entry.field} is not owned by resource kind`);
    const type = field?.type || standard;
    if (type === "string" && typeof entry.value !== "string") errors.push(`wrong type for ${entry.field}`);
    if (type === "integer" && !Number.isSafeInteger(entry.value)) errors.push(`wrong type for ${entry.field}`);
    if (type === "number" && !(typeof entry.value === "number" && Number.isFinite(entry.value))) errors.push(`wrong type for ${entry.field}`);
  }
}
function valueMap(entries) { return new Map(entries.map(entry => [entry.field, entry.value])); }
function allowedProjection(kind, eventName) {
  if (kind === "EVENT_CONTRIBUTION") {
    const eventRule = observationRegistry.applicability.events[eventName];
    return new Set(eventRule ? eventRule.allowed : []);
  }
  return new Set(registry.projection[kind].fields.map(name => name.replace(/[?]$/, "")));
}
function expectedOwner(fact) {
  const v = valueMap(fact.fields);
  switch (fact.kind) {
    case "EVENT_CONTRIBUTION": return [fact.compatibility.event_name, v.get("C09") ?? fact.source.event_id];
    case "FINDING_ASSERTION": return fact.provenance.owner_key;
    case "FINDING_TARGET": return [v.get("C18"), v.get("C51"), v.get("C52"), v.get("C53"), v.get("C54") ?? null];
    case "FINDING_STATUS": return [v.get("C18"), v.get("C51"), v.get("C12")];
    case "FINDING_FIX": return [v.get("C18"), v.get("C51"), v.get("C52") ?? fact.provenance.owner_key[2], v.get("C53") ?? fact.provenance.owner_key[3], fact.provenance.owner_key[4], v.get("C21")];
    case "FINDING_RECHECK": return [v.get("C18"), v.get("C51"), fact.provenance.owner_key[2], fact.provenance.owner_key[3], fact.provenance.owner_key[4], v.get("C23")];
    case "ROLE_LINEAGE": return [v.get("C49"), v.get("C30")];
    case "DELIVERY_ROOT_BINDING": return [fact.source.trace_id];
    case "MODEL_ATTRIBUTION": return [v.get("gen_ai.provider.name"), v.get("C57"), v.get("C30"), v.get("C06"), fact.source.trace_id, fact.source.span_id];
  }
}
function expectedRelationship(fact) {
  const owner = fact.provenance.owner_key;
  const v = valueMap(fact.fields);
  switch (fact.kind) {
    case "FINDING_TARGET": return { kind: "FINDING_TARGET", from: { kind: "FINDING", key: owner.slice(0, 2) }, to: { kind: "FINDING_TARGET", key: owner } };
    case "FINDING_FIX": return { kind: "FINDING_FIX", from: { kind: "FIX", key: [owner[5]] }, to: { kind: "FINDING_TARGET", key: owner.slice(0, 5) } };
    case "FINDING_RECHECK": return { kind: "FINDING_RECHECK", from: { kind: "RECHECK", key: [owner[5]] }, to: { kind: "FINDING_TARGET", key: owner.slice(0, 5) } };
    case "ROLE_LINEAGE": return { kind: "ROLE_LINEAGE", from: { kind: "ROLE", key: owner }, to: { kind: "ROLE_LINEAGE", key: [owner[0], v.get("C31")] } };
    case "DELIVERY_ROOT_BINDING": return { kind: "DELIVERY_ROOT", from: { kind: "SPAN", key: [fact.source.trace_id, fact.source.span_id] }, to: { kind: "DELIVERY", key: [v.get("C01")] } };
    case "MODEL_ATTRIBUTION": return { kind: "MODEL_ATTRIBUTION", from: { kind: "SPAN", key: [fact.source.trace_id, fact.source.span_id] }, to: { kind: "MODEL_ROLE", key: owner.slice(0, 4) } };
    default: return null;
  }
}
function expectedDimensions(fact) {
  const key = fact.kind === "EVENT_CONTRIBUTION" ? fact.compatibility.event_name : fact.kind;
  const ids = registry.compatibility_dimensions[key] || [];
  const values = valueMap(fact.fields);
  return ids.filter(id => values.has(id)).map(field => ({ field, value: values.get(field) }));
}
function checkTruth(truth, isTrace, errors) {
  if (truth.expires_at !== null && !validTimestamp(truth.expires_at)) errors.push("invalid expires_at");
  if (isTrace && truth.completeness !== null) errors.push("Trace completeness must be null");
  if (truth.expiry === "EXPIRED" && truth.availability !== "UNAVAILABLE") errors.push("expired detail must be unavailable");
  if (truth.expiry === "ACTIVE") {
    if (truth.completeness === "UNAVAILABLE" && truth.availability !== "UNAVAILABLE") errors.push("UNAVAILABLE completeness requires unavailable detail");
    if (["FINAL", "LOWER_BOUND", "NOT_APPLICABLE", null].includes(truth.completeness) && truth.availability !== "AVAILABLE") errors.push("active retained fact has wrong availability");
  }
}
function validateFact(fact, errors) {
  if (utf8Length(fact.id) > registry.limits.resource_id_utf8_bytes) errors.push("Fact id exceeds byte bound");
  if (!validTimestamp(fact.recorded_at)) errors.push("invalid recorded_at");
  if (!fact.provenance.owner_key.every(validateScalar)) errors.push("invalid owner_key scalar/bound");
  if (fact.source.kind !== registry.projection[fact.kind].source) errors.push("wrong source kind");
  if (!ownerShape("FACTUAL_PROJECTION", fact.kind, fact.provenance.owner_key, fact.source)) errors.push("invalid exact Fact owner tuple");
  if (fact.kind === "EVENT_CONTRIBUTION" && valueMap(fact.fields).get("C09") !== fact.source.event_id) errors.push("Event source identity differs from C09");
  checkTruth(fact.truth, false, errors);
  if (fact.compatibility.completeness !== fact.truth.completeness) errors.push("compatibility completeness differs from truth");
  if (!unique(fact.compatibility.dimensions, item => item.field)) errors.push("dimension fields must be unique");
  const expired = fact.truth.expiry === "EXPIRED";
  checkFields(fact.fields, errors, { allowedIds: allowedProjection(fact.kind, fact.compatibility.event_name), expired });
  if (["UNAVAILABLE", "NOT_APPLICABLE"].includes(fact.truth.completeness) && fact.fields.some(field => measurementFields.has(field.field))) errors.push("unavailable/not-applicable fact retains a measurement value");
  if (expired && fact.relationships.length) errors.push("expired detail must have empty relationships");
  if (!expired) {
    const owner = expectedOwner(fact);
    if (owner.some(value => value === undefined) || !same(owner, fact.provenance.owner_key)) errors.push("Fact owner_key differs from projection tuple");
    const relationship = expectedRelationship(fact);
    if (relationship ? !(fact.relationships.length === 1 && same(fact.relationships[0], relationship)) : fact.relationships.length !== 0) errors.push("Fact relationship differs from projection matrix");
    if (!same(fact.compatibility.dimensions, expectedDimensions(fact))) errors.push("compatibility dimensions differ in membership/order");
  }
}
function traceIdentity(item) {
  if (item.kind === "NODE") return ["NODE", item.trace_id, item.source.span_id];
  if (item.kind === "PARENT_EDGE") return ["PARENT_EDGE", item.trace_id, item.source.span_id, item.edge.to.span_id];
  return ["LINK", item.trace_id, item.source.span_id, item.edge.to.trace_id, item.edge.to.span_id];
}
function validateTraceItem(item, errors) {
  if (utf8Length(item.id) > registry.limits.resource_id_utf8_bytes) errors.push("Trace id exceeds byte bound");
  if (!validTimestamp(item.recorded_at)) errors.push("invalid recorded_at");
  if (item.source.kind !== "SPAN" || item.source.trace_id !== item.trace_id) errors.push("Trace source identity mismatch");
  checkTruth(item.truth, true, errors);
  if (item.truth.expiry !== "ACTIVE" || item.truth.availability !== "AVAILABLE") errors.push("Trace items contain active detail only");
  if (item.kind === "NODE") {
    if (item.node.span_id !== item.source.span_id) errors.push("NODE tuple mismatch");
    checkFields(item.node.fields, errors, { allowedIds: new Set([...observationRegistry.applicability.span.allowed, ...standardTypes.keys()]) });
  } else if (item.edge.from.trace_id !== item.trace_id || item.edge.from.span_id !== item.source.span_id) errors.push("edge recording Span mismatch");
}
function aggregateTraceState(summaries) {
  if (!summaries.length) return "ABSENT";
  if (summaries.every(summary => summary.state === "EXPIRED")) return "EXPIRED";
  if (summaries.every(summary => summary.state === "AVAILABLE")) return "AVAILABLE";
  return "PARTIAL";
}
function validateResponse(response, route) {
  const errors = [];
  if (!responseOracle(response)) return { valid: false, errors: errorsOf(responseOracle) };
  if (response.error) {
    if (utf8Length(response.error.message) > registry.limits.error_message_utf8_bytes) errors.push("error message exceeds byte bound");
    if (/sql|credential|\/Users\/|stack|payload/i.test(response.error.message)) errors.push("error message exposes prohibited diagnostic");
    return { valid: errors.length === 0, errors };
  }
  if (route === "facts") {
    if (Object.hasOwn(response, "trace_state")) errors.push("facts response has Trace fields");
    for (const fact of response.items) validateFact(fact, errors);
    const sorted = [...response.items].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.kind.localeCompare(b.kind) || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
    if (!same(response.items, sorted)) errors.push("Facts are not ordered by recorded_at/kind/id");
  } else if (route === "traces") {
    for (const item of response.items) validateTraceItem(item, errors);
    if (!strictlySorted(response.trace_summaries, (a, b) => Buffer.compare(Buffer.from(a.trace_id), Buffer.from(b.trace_id)))) errors.push("trace_summaries must be unique and ordered");
    if (response.trace_state !== aggregateTraceState(response.trace_summaries)) errors.push("response trace_state does not aggregate summaries");
    if (["ABSENT", "EXPIRED"].includes(response.trace_state) && (response.items.length || response.next_cursor !== null)) errors.push("absent/expired traversal must be empty and terminal");
    const summaries = new Map(response.trace_summaries.map(summary => [summary.trace_id, summary.state]));
    for (const item of response.items) if (!["AVAILABLE", "PARTIAL"].includes(summaries.get(item.trace_id))) errors.push("active item lacks available/partial summary");
    const sorted = [...response.items].sort((a, b) => a.trace_id.localeCompare(b.trace_id) || kindOrder.get(a.kind) - kindOrder.get(b.kind) || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
    if (!same(response.items, sorted)) errors.push("Trace items are not ordered by trace/kind/id");
  } else errors.push("route must be facts or traces");
  return { valid: errors.length === 0, errors };
}

function encodeScalar(value) {
  if (value === null) return Buffer.from("n\n");
  if (typeof value === "boolean") return Buffer.from(`b${value ? 1 : 0}\n`);
  if (typeof value === "string") { const bytes = Buffer.from(value); return Buffer.concat([Buffer.from(`s${bytes.length}:`), bytes, Buffer.from("\n")]); }
  if (Number.isInteger(value)) return Buffer.from(`i${value}\n`);
  if (typeof value === "number" && Number.isFinite(value)) { const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value); return Buffer.from(`f${bytes.toString("hex")}\n`); }
  if (Array.isArray(value)) return Buffer.concat([Buffer.from(`a${value.length}\n`), ...value.map(encodeScalar)]);
  throw new TypeError("not a Contract scalar/array");
}
function memberArray(member) { return [member.resource_kind, member.owner_key]; }
function canonicalBatchBytes(batch) {
  return Buffer.concat([
    Buffer.from("evidence-expiry-batch-v1\n"),
    encodeScalar(batch.resource_class), encodeScalar(batch.policy_revision), encodeScalar(batch.cutoff), encodeScalar(batch.ttl_seconds),
    encodeScalar(batch.members.map(memberArray))
  ]);
}
function resourceKindAllowed(resourceClass, kind) {
  if (resourceClass === "RAW_DEBUG") return kind === "RAW_DEBUG";
  if (resourceClass === "TRACE_DETAIL") return traceKinds.has(kind);
  if (resourceClass === "FACTUAL_PROJECTION") return factualKinds.has(kind);
  return false;
}
function ownerShape(resourceClass, kind, owner, source) {
  if (!owner.every(validateScalar)) return false;
  const text = value => typeof value === "string" && value.length > 0;
  const trace = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
  const span = value => typeof value === "string" && /^[a-f0-9]{16}$/.test(value);
  if (resourceClass === "RAW_DEBUG") {
    if (owner.length === 2 && owner[0] === "event") return !source || source.kind === "EVENT" && owner[1] === source.event_id;
    if (owner.length === 3 && owner[0] === "span" && trace(owner[1]) && span(owner[2])) return !source || source.kind === "SPAN" && owner[1] === source.trace_id && owner[2] === source.span_id;
    return false;
  }
  if (resourceClass === "TRACE_DETAIL") {
    const recordingSpanMatches = !source || source.kind === "SPAN" && owner[0] === source.trace_id && owner[1] === source.span_id;
    if (kind === "NODE") return owner.length === 2 && trace(owner[0]) && span(owner[1]) && recordingSpanMatches;
    if (kind === "PARENT_EDGE") return owner.length === 3 && trace(owner[0]) && span(owner[1]) && span(owner[2]) && recordingSpanMatches;
    if (kind === "LINK") return owner.length === 4 && trace(owner[0]) && span(owner[1]) && trace(owner[2]) && span(owner[3]) && recordingSpanMatches;
    return false;
  }
  if (resourceClass !== "FACTUAL_PROJECTION") return false;
  const allText = values => values.every(text);
  const nullableText = value => value === null || text(value);
  const eventSource = !source || source.kind === "EVENT";
  if (kind === "EVENT_CONTRIBUTION") return owner.length === 2 && allText(owner) && eventSource && (!source || owner[1] === source.event_id);
  if (kind === "FINDING_ASSERTION") return owner.length === 2 && allText(owner) && eventSource;
  if (kind === "FINDING_TARGET") return owner.length === 5 && allText(owner.slice(0, 4)) && nullableText(owner[4]) && eventSource;
  if (kind === "FINDING_STATUS") return owner.length === 3 && allText(owner) && eventSource;
  if (["FINDING_FIX", "FINDING_RECHECK"].includes(kind)) return owner.length === 6 && allText(owner.slice(0, 4)) && nullableText(owner[4]) && text(owner[5]) && eventSource;
  if (kind === "ROLE_LINEAGE") return owner.length === 2 && allText(owner) && eventSource;
  if (kind === "DELIVERY_ROOT_BINDING") return owner.length === 1 && trace(owner[0]) && (!source || source.kind === "SPAN" && owner[0] === source.trace_id);
  if (kind === "MODEL_ATTRIBUTION") return owner.length === 6 && allText(owner.slice(0, 4)) && trace(owner[4]) && span(owner[5]) && (!source || source.kind === "SPAN" && owner[4] === source.trace_id && owner[5] === source.span_id);
  return false;
}
function validateCompatibility(record, errors) {
  const pairs = record.compatibility;
  if (!unique(pairs, pair => pair[0])) errors.push("ExpiryRecord compatibility keys must be unique");
  if (record.resource_class !== "FACTUAL_PROJECTION") { if (pairs.length) errors.push("Raw/Trace compatibility must be empty"); return; }
  const base = ["family_schema", "event_name", "completeness"];
  if (!same(pairs.slice(0, 3).map(pair => pair[0]), base)) errors.push("factual compatibility must begin with exact base pairs");
  const eventName = pairs.find(pair => pair[0] === "event_name")?.[1];
  const dimensionKey = registry.compatibility_dimensions[record.resource_kind] ? record.resource_kind : eventName;
  const dimensionOrder = registry.compatibility_dimensions[dimensionKey] || [];
  const allowed = new Set([...base, ...dimensionOrder, "delivery_id"]);
  if (pairs.some(pair => !allowed.has(pair[0]))) errors.push("unlisted expiry compatibility key");
  const actualDimensions = pairs.slice(3).filter(pair => pair[0] !== "delivery_id").map(pair => pair[0]);
  const expectedDimensions = dimensionOrder.filter(key => actualDimensions.includes(key));
  if (!same(actualDimensions, expectedDimensions)) errors.push("expiry compatibility dimensions are not in published order");
  if (record.resource_kind === "DELIVERY_ROOT_BINDING") {
    if (pairs.length !== 4 || pairs[3][0] !== "delivery_id") errors.push("Delivery root marker requires fourth/final delivery_id pair");
  } else if (pairs.some(pair => pair[0] === "delivery_id")) errors.push("delivery_id marker pair is Delivery-root only");
}
function validateInternalValue(value) {
  const errors = [];
  if (!internalOracle(value)) return { valid: false, errors: errorsOf(internalOracle) };
  if (value.value_type === "ExpiryOwner") {
    const resourceClass = value.resource_kind === "RAW_DEBUG" ? "RAW_DEBUG" : traceKinds.has(value.resource_kind) ? "TRACE_DETAIL" : "FACTUAL_PROJECTION";
    if (!ownerShape(resourceClass, value.resource_kind, value.owner_key)) errors.push("invalid exact ExpiryOwner tuple");
  }
  if (value.value_type === "ExpiryRecord") {
    if (!resourceKindAllowed(value.resource_class, value.resource_kind) || !ownerShape(value.resource_class, value.resource_kind, value.owner_key, value.source)) errors.push("ExpiryRecord class/kind/owner mismatch");
    validateCompatibility(value, errors);
    if (!validTimestamp(value.recorded_at) || !validTimestamp(value.expires_at) || !validTimestamp(value.expired_at)) errors.push("ExpiryRecord timestamp invalid");
  }
  if (value.value_type === "ExpiryBatch") {
    if (!validTimestamp(value.cutoff)) errors.push("ExpiryBatch cutoff invalid");
    if (!unique(value.members, member => canonical(memberArray(member)))) errors.push("ExpiryBatch members must be unique");
    if (value.members.some(member => !resourceKindAllowed(value.resource_class, member.resource_kind) || !ownerShape(value.resource_class, member.resource_kind, member.owner_key))) errors.push("ExpiryBatch mixed/invalid member");
    const encodings = value.members.map(member => encodeScalar(memberArray(member)));
    if (!strictlySorted(encodings, Buffer.compare)) errors.push("ExpiryBatch members are not canonical ascending");
    if (value.batch_identity !== digest(canonicalBatchBytes(value))) errors.push("ExpiryBatch digest mismatch");
  }
  if (value.value_type === "ExpiryResult" && value.expired + value.already_expired !== value.selected) errors.push("ExpiryResult counts do not balance");
  if (value.value_type === "TraceSummarySet" && !strictlySorted(value.summaries, (a, b) => Buffer.compare(Buffer.from(a.trace_id), Buffer.from(b.trace_id)))) errors.push("TraceSummarySet is not ordered/unique");
  return { valid: errors.length === 0, errors };
}

function acceptAllowsJson(header) {
  if (header === undefined || header === null) return true;
  if (header === "") return false;
  return header.split(",").some(part => {
    const pieces = part.trim().split(";");
    const media = pieces.shift().trim().toLowerCase();
    if (!["application/json", "application/*", "*/*"].includes(media)) return false;
    const qParams = pieces.map(value => value.trim()).filter(value => /^q\s*=/i.test(value));
    if (qParams.length > 1) return false;
    if (!qParams.length) return true;
    const match = /^q=(0(?:\.[0-9]{1,3})?|1(?:\.0{1,3})?)$/i.exec(qParams[0]);
    return Boolean(match) && Number(match[1]) > 0;
  });
}
function invalidValue(value) { return !value || /[\x00-\x1f,\*%\\]/.test(value); }
function validRequestTimestamp(value) {
  const match = /^([0-9]{4}-(?:0[1-9]|1[0-2])-(?:[0-2][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])(?:\.([0-9]{1,6}))?Z$/.exec(value);
  if (!match) return false;
  return validTimestamp(`${match[1]}.${(match[2] || "").padEnd(6, "0")}Z`);
}
function classifyRequest(request) {
  const knownRoute = registry.routes.includes(request.path);
  if (!knownRoute) return { http: 404, code: "ROUTE_NOT_FOUND" };
  if (request.method !== "GET") return { http: 405, code: "METHOD_NOT_ALLOWED" };
  if (request.body !== undefined && request.body !== null && request.body !== "") return { http: 400, code: "INVALID_FILTER" };
  if (!acceptAllowsJson(request.accept)) return { http: 406, code: "NOT_ACCEPTABLE" };
  if (request.service_available === false) return { http: 503, code: "QUERY_UNAVAILABLE" };
  const pairs = request.query || [];
  const names = pairs.map(pair => pair[0]);
  const allowed = request.path.endsWith("/facts") ? new Set(["kind", "event_name", "family_schema", "delivery_id", "trace_id", "recorded_from", "recorded_to", "limit", "cursor"]) : new Set(["delivery_id", "trace_id", "limit", "cursor"]);
  if (!unique(names, value => value) || pairs.some(([name, value]) => !allowed.has(name) || invalidValue(value))) return { http: 400, code: "INVALID_FILTER" };
  const q = Object.fromEntries(pairs);
  if (q.limit && !/^[1-9][0-9]*$/.test(q.limit)) return { http: 400, code: "INVALID_FILTER" };
  const limit = q.limit ? Number(q.limit) : 100;
  if (limit < 1 || limit > 200) return { http: 400, code: "INVALID_FILTER" };
  if (q.trace_id && !/^[a-f0-9]{32}$/.test(q.trace_id)) return { http: 400, code: "INVALID_FILTER" };
  if (q.family_schema && utf8Length(q.family_schema) > 128 || q.delivery_id && utf8Length(q.delivery_id) > 256) return { http: 400, code: "INVALID_FILTER" };
  if (q.recorded_from && !validRequestTimestamp(q.recorded_from) || q.recorded_to && !validRequestTimestamp(q.recorded_to)) return { http: 400, code: "INVALID_FILTER" };
  if (q.recorded_from && q.recorded_to) {
    const from = Date.parse(q.recorded_from), to = Date.parse(q.recorded_to);
    if (from > to || to - from > 366 * 86400000) return { http: 400, code: "INVALID_FILTER" };
  }
  if (q.kind && !factKinds.has(q.kind) || q.event_name && !eventNames.has(q.event_name) || q.event_name && q.kind && q.kind !== "EVENT_CONTRIBUTION") return { http: 400, code: "INVALID_FILTER" };
  if (request.path.endsWith("/traces") && Boolean(q.trace_id) === Boolean(q.delivery_id)) return { http: 400, code: "INVALID_FILTER" };
  if (request.delivery_trace_count > 32) return { http: 413, code: "QUERY_BOUND_EXCEEDED" };
  if (q.cursor) {
    if (request.cursor_state === "malformed" || request.cursor_state === "tampered") return { http: 400, code: "INVALID_CURSOR" };
    if (request.cursor_state === "mismatch") return { http: 409, code: "CURSOR_MISMATCH" };
    if (["expired", "evicted", "unknown", "restart-lost"].includes(request.cursor_state)) return { http: 410, code: "CURSOR_EXPIRED" };
  }
  return { http: 200, code: "OK" };
}
function classifyTraceIdentity(items) {
  const seen = new Map();
  let duplicate = false;
  for (const item of items) {
    const identity = canonical(item.kind === "NODE" ? ["NODE", item.trace_id, item.span_id] : item.kind === "PARENT_EDGE" ? ["PARENT_EDGE", item.trace_id, item.recording_span_id, item.parent_span_id] : ["LINK", item.trace_id, item.recording_span_id, item.target_trace_id, item.target_span_id]);
    const detail = canonical(item.kind === "LINK" ? { ...(Object.hasOwn(item, "trace_state") ? { trace_state: item.trace_state } : {}), ...(Object.hasOwn(item, "flags") ? { flags: item.flags } : {}) } : item);
    if (seen.has(identity)) {
      if (seen.get(identity) !== detail) return "CONFLICT";
      duplicate = true;
    } else seen.set(identity, detail);
  }
  return duplicate ? "DUPLICATE" : "ACCEPT";
}
function planMembers(input) {
  return input.resources
    .filter(resource => resource.eligible && !resource.marked)
    .sort((a, b) => Buffer.compare(Buffer.from(a.resource_kind), Buffer.from(b.resource_kind)) || Buffer.compare(Buffer.from(a.stored_owner_key_json), Buffer.from(b.stored_owner_key_json)))
    .slice(0, input.limit)
    .map(({ resource_kind, owner_key }) => ({ resource_kind, owner_key }))
    .sort((a, b) => Buffer.compare(encodeScalar(memberArray(a)), encodeScalar(memberArray(b))));
}
function verifyManifestBinding() {
  const errors = [];
  const binding = registry.manifest_binding;
  const manifestPath = join(SUPER, binding.path);
  if (!existsSync(manifestPath)) return { valid: false, errors: ["parent Wave6 manifest unavailable"] };
  const bytes = readFileSync(manifestPath);
  if (digest(bytes) !== binding.sha256) errors.push("Wave6 manifest digest mismatch");
  const manifest = JSON.parse(bytes);
  if (`${manifest.contract.name}@${manifest.contract.revision}` !== "evidence.query@0.1.0") errors.push("contract coordinate mismatch");
  if (manifest.contract.semantic_sha256 !== binding.semantic_sha256 || manifest.contract.translation_sha256 !== binding.translation_sha256) errors.push("semantic binding mismatch");
  if (manifest.semantic_sections.truth_table.sha256 !== binding.truth_table_sha256 || manifest.semantic_sections.lifecycle_defaults.sha256 !== binding.lifecycle_defaults_sha256) errors.push("section binding mismatch");
  for (const key of ["registry", "schema", "validator"]) {
    const coordinate = registry.upstream_machine[key];
    const path = join(ROOT, "..", coordinate.path.replace(/^observation\//, "observation/"));
    if (!existsSync(path) || digest(readFileSync(path)) !== coordinate.sha256) errors.push(`upstream ${key} digest mismatch`);
  }
  return { valid: errors.length === 0, errors };
}
function evaluateFixture(fixture) {
  if (!fixtureOracle(fixture)) return "REJECT";
  let actual;
  if (fixture.kind === "response") actual = validateResponse(fixture.input.response, fixture.input.route).valid ? "ACCEPT" : "REJECT";
  if (fixture.kind === "internal") actual = validateInternalValue(fixture.input.value).valid ? "ACCEPT" : "REJECT";
  if (fixture.kind === "request") actual = classifyRequest(fixture.input.request).code === (fixture.input.expected_code || "OK") ? (fixture.category === "recovery" ? "RECOVER" : fixture.input.expected_code === "OK" ? "ACCEPT" : "REJECT") : "REJECT";
  if (fixture.kind === "trace_identity") actual = classifyTraceIdentity(fixture.input.items);
  if (fixture.kind === "batch_digest") actual = digest(canonicalBatchBytes(fixture.input.batch)) === fixture.input.sha256 ? "ACCEPT" : "REJECT";
  if (fixture.kind === "batch_selection") actual = same(planMembers(fixture.input), fixture.input.expected_members) ? (fixture.category === "recovery" ? "RECOVER" : "ACCEPT") : "REJECT";
  if (fixture.kind === "manifest_binding") actual = verifyManifestBinding().valid ? "ACCEPT" : "REJECT";
  if (fixture.kind === "same_snapshot") actual = fixture.input.pages.every(page => page.snapshot === fixture.input.pages[0].snapshot && same(page.trace_summaries, fixture.input.pages[0].trace_summaries)) ? (fixture.category === "recovery" ? "RECOVER" : "ACCEPT") : "REJECT";
  return actual;
}

module.exports = { acceptAllowsJson, aggregateTraceState, ajv, canonicalBatchBytes, classifyRequest, classifyTraceIdentity, digest, encodeScalar, evaluateFixture, fixtureOracle, planMembers, registry, validateInternalValue, validateResponse, verifyManifestBinding };
