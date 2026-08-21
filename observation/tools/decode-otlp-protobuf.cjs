#!/usr/bin/env node
// Bounded fixture decoder for official OTLP ExportTraceServiceRequest / ExportLogsServiceRequest bytes.
// This is a conformance companion, not a network listener or production Admission implementation.
const { readFileSync } = require("node:fs");
const { decodeOtlpRequest } = require("./validator.cjs");

const [first, second] = process.argv.slice(2);
let signal;
let bytes;
let familySchema;
if (first?.endsWith(".json") && !second) {
  const fixture = JSON.parse(readFileSync(first, "utf8")).input?.otlp_protobuf;
  if (!fixture) throw new Error("fixture has no input.otlp_protobuf");
  signal = fixture.signal;
  bytes = Buffer.from(fixture.base64, "base64");
  familySchema = fixture.family_schema;
} else {
  signal = first;
  if (second) bytes = readFileSync(second);
}
if (!["traces", "logs"].includes(signal) || !bytes) throw new Error("usage: decode-otlp-protobuf.cjs <fixture.json> | traces|logs <binary-file>");
console.log(JSON.stringify(decodeOtlpRequest(signal, bytes, { familySchema })));
