// Signal-specific OTLP protobuf codec used only by the bounded conformance checker.
const protobuf = require("protobufjs");

const source = `
syntax = "proto3";
package otlp;
message AnyValue { oneof value { string string_value = 1; bool bool_value = 2; int64 int_value = 3; double double_value = 4; bytes bytes_value = 7; } }
message KeyValue { string key = 1; AnyValue value = 2; }
message Resource { repeated KeyValue attributes = 1; uint32 dropped_attributes_count = 2; }
message InstrumentationScope { string name = 1; string version = 2; repeated KeyValue attributes = 3; uint32 dropped_attributes_count = 4; }
message SpanEvent { fixed64 time_unix_nano = 1; string name = 2; repeated KeyValue attributes = 3; uint32 dropped_attributes_count = 4; }
message Link { bytes trace_id = 1; bytes span_id = 2; string trace_state = 3; repeated KeyValue attributes = 4; uint32 dropped_attributes_count = 5; fixed32 flags = 6; }
message Status { string message = 2; int32 code = 3; }
message Span { bytes trace_id = 1; bytes span_id = 2; string trace_state = 3; bytes parent_span_id = 4; string name = 5; int32 kind = 6; fixed64 start_time_unix_nano = 7; fixed64 end_time_unix_nano = 8; repeated KeyValue attributes = 9; uint32 dropped_attributes_count = 10; repeated SpanEvent events = 11; uint32 dropped_events_count = 12; repeated Link links = 13; uint32 dropped_links_count = 14; Status status = 15; fixed32 flags = 16; }
message ScopeSpans { InstrumentationScope scope = 1; repeated Span spans = 2; string schema_url = 3; }
message ResourceSpans { Resource resource = 1; repeated ScopeSpans scope_spans = 2; string schema_url = 3; }
message ExportTraceServiceRequest { repeated ResourceSpans resource_spans = 1; }
message LogRecord { fixed64 time_unix_nano = 1; fixed64 observed_time_unix_nano = 2; int32 severity_number = 3; string severity_text = 4; AnyValue body = 5; repeated KeyValue attributes = 6; uint32 dropped_attributes_count = 7; fixed32 flags = 8; bytes trace_id = 9; bytes span_id = 10; string event_name = 12; }
message ScopeLogs { InstrumentationScope scope = 1; repeated LogRecord log_records = 2; string schema_url = 3; }
message ResourceLogs { Resource resource = 1; repeated ScopeLogs scope_logs = 2; string schema_url = 3; }
message ExportLogsServiceRequest { repeated ResourceLogs resource_logs = 1; }
`;

const root = protobuf.parse(source, { keepCase: true }).root;
const types = {
  traces: root.lookupType("otlp.ExportTraceServiceRequest"),
  logs: root.lookupType("otlp.ExportLogsServiceRequest")
};

function scalar(any) {
  if (!any) throw new Error("attribute has no AnyValue");
  for (const name of ["string_value", "bool_value", "int_value", "double_value"]) {
    if (Object.hasOwn(any, name) && any[name] !== null && any[name] !== undefined) {
      const value = any[name];
      return name === "int_value" && typeof value === "object" ? value.toNumber() : value;
    }
  }
  throw new Error("Observation attributes must use scalar AnyValue values");
}

function attributes(values = []) {
  const result = {};
  for (const item of values) {
    if (!item.key || Object.hasOwn(result, item.key)) throw new Error("empty or duplicate OTLP attribute key");
    result[item.key] = scalar(item.value);
  }
  return result;
}

function resourceShape(resource) {
  const a = attributes(resource?.attributes);
  if (resource?.dropped_attributes_count) throw new Error("dropped Resource attributes make profile admission incomplete");
  if (Object.keys(a).some(name => !["service.name", "service.version"].includes(name))) throw new Error("unexpected Resource attribute in closed Observation profile");
  return { "service.name": a["service.name"], "service.version": a["service.version"] };
}

function scopeShape(scope, schemaUrl) {
  if ((scope?.attributes || []).length || scope?.dropped_attributes_count) throw new Error("InstrumentationScope attributes are outside the closed Observation profile");
  return { name: scope?.name, version: scope?.version, schema_url: schemaUrl };
}

const spanKinds = ["UNSPECIFIED", "INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"];
const spanKindNumbers = new Map(spanKinds.map((name, index) => [name, index]));
const statusCodes = ["UNSET", "OK", "ERROR"];
const statusCodeNumbers = new Map(statusCodes.map((name, index) => [name, index]));
const longString = value => value && typeof value === "object" ? value.toString() : String(value || 0);
const PROFILE_ERRORS = Symbol("observationProfileErrors");

function captureProfileValue(errors, operation, fallback) {
  try { return operation(); }
  catch (error) { errors.push(error.message); return fallback; }
}

function attachProfileErrors(record, errors) {
  if (errors.length) Object.defineProperty(record, PROFILE_ERRORS, { value: errors });
  return record;
}

function profileErrors(record) {
  return record?.[PROFILE_ERRORS] || [];
}

function linkShape(link) {
  if ((link.attributes || []).length || link.dropped_attributes_count) throw new Error("Span Link attributes are outside the closed Observation profile");
  return {
    trace_id: Buffer.from(link.trace_id || []).toString("hex"),
    span_id: Buffer.from(link.span_id || []).toString("hex"),
    ...(link.trace_state ? { trace_state: link.trace_state } : {}),
    ...(link.flags ? { flags: link.flags } : {})
  };
}

function decode(signal, bytes) {
  const type = types[signal];
  if (!type || !Buffer.isBuffer(bytes)) throw new Error("OTLP protobuf request requires a known signal and bytes");
  let message;
  try { message = type.decode(bytes); }
  catch (error) { throw new Error(`truncated or malformed ${signal} protobuf: ${error.message}`); }
  const records = [];
  if (signal === "traces") {
    for (const resourceGroup of message.resource_spans || []) {
      for (const scopeGroup of resourceGroup.scope_spans || []) {
        for (const span of scopeGroup.spans || []) {
          const errors = [];
          if ((span.events || []).length || span.dropped_events_count) errors.push("Span Events are outside the closed Observation profile");
          if (span.dropped_links_count) errors.push("dropped Span Links make profile admission incomplete");
          if (span.status?.message) errors.push("Span Status message is outside the content-minimized Observation profile");
          const statusCode = span.status?.code ?? 0;
          const record = {
            profile_version: "1.0.0",
            record_type: "span",
            span_name: span.name,
            trace_id: Buffer.from(span.trace_id || []).toString("hex"),
            span_id: Buffer.from(span.span_id || []).toString("hex"),
            span_kind: spanKinds[span.kind] || "UNSPECIFIED",
            start_time_unix_nano: longString(span.start_time_unix_nano),
            end_time_unix_nano: longString(span.end_time_unix_nano),
            ...(span.parent_span_id?.length ? { parent_span_id: Buffer.from(span.parent_span_id).toString("hex") } : {}),
            ...(span.trace_state ? { trace_state: span.trace_state } : {}),
            span_flags: span.flags || 0,
            span_links: captureProfileValue(errors, () => (span.links || []).map(linkShape), []),
            span_status: statusCodes[statusCode] ?? statusCode,
            resource: captureProfileValue(errors, () => resourceShape(resourceGroup.resource), {}),
            scope: captureProfileValue(errors, () => scopeShape(scopeGroup.scope, scopeGroup.schema_url), {}),
            attributes: captureProfileValue(errors, () => {
              if (span.dropped_attributes_count) throw new Error("dropped Span attributes make profile admission incomplete");
              return attributes(span.attributes);
            }, {})
          };
          records.push(attachProfileErrors(record, errors));
        }
      }
    }
  } else {
    for (const resourceGroup of message.resource_logs || []) {
      for (const scopeGroup of resourceGroup.scope_logs || []) {
        for (const log of scopeGroup.log_records || []) {
          const errors = [];
          const record = {
            profile_version: "1.0.0",
            record_type: "event",
            event_name: log.event_name,
            resource: captureProfileValue(errors, () => resourceShape(resourceGroup.resource), {}),
            scope: captureProfileValue(errors, () => scopeShape(scopeGroup.scope, scopeGroup.schema_url), {}),
            attributes: captureProfileValue(errors, () => {
              if (log.body || log.dropped_attributes_count) throw new Error("LogRecord body or dropped attributes are outside the closed Observation profile");
              return attributes(log.attributes);
            }, {})
          };
          records.push(attachProfileErrors(record, errors));
        }
      }
    }
  }
  return records;
}

function any(value) {
  if (typeof value === "string") return { string_value: value };
  if (typeof value === "boolean") return { bool_value: value };
  if (Number.isInteger(value)) return { int_value: value };
  if (typeof value === "number" && Number.isFinite(value)) return { double_value: value };
  throw new Error("unsupported logical attribute value");
}

function keyValues(value) {
  return Object.entries(value).map(([key, item]) => ({ key, value: any(item) }));
}

function encode(signal, records) {
  const groups = records.map(record => {
    const resource = { attributes: keyValues(record.resource) };
    const scope = { name: record.scope.name, version: record.scope.version };
    if (signal === "traces") return { resource, scope_spans: [{ scope, schema_url: record.scope.schema_url, spans: [{
      trace_id: Buffer.from(record.trace_id, "hex"),
      span_id: Buffer.from(record.span_id, "hex"),
      name: record.span_name,
      kind: spanKindNumbers.get(record.span_kind),
      start_time_unix_nano: record.start_time_unix_nano,
      end_time_unix_nano: record.end_time_unix_nano,
      ...(record.parent_span_id ? { parent_span_id: Buffer.from(record.parent_span_id, "hex") } : {}),
      ...(record.trace_state ? { trace_state: record.trace_state } : {}),
      flags: record.span_flags || 0,
      links: (record.span_links || []).map(link => ({ trace_id: Buffer.from(link.trace_id, "hex"), span_id: Buffer.from(link.span_id, "hex"), trace_state: link.trace_state || "", flags: link.flags || 0 })),
      status: { ...(record.span_status_message ? { message: record.span_status_message } : {}), code: statusCodeNumbers.get(record.span_status || "UNSET") },
      attributes: keyValues(record.attributes)
    }] }] };
    return { resource, scope_logs: [{ scope, schema_url: record.scope.schema_url, log_records: [{ event_name: record.event_name, attributes: keyValues(record.attributes) }] }] };
  });
  const payload = signal === "traces" ? { resource_spans: groups } : { resource_logs: groups };
  return Buffer.from(types[signal].encode(types[signal].create(payload)).finish());
}

module.exports = { decode, encode, profileErrors };
