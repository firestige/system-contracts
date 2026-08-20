#!/usr/bin/env node
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { ajv, evaluateFixture, load, validateBatch } = require("./validator.cjs");

const ROOT = join(__dirname, "..");
const roleIndex = process.argv.indexOf("--role");
const role = roleIndex === -1 ? "acceptor" : process.argv[roleIndex + 1];
if (!["producer", "acceptor"].includes(role)) throw new Error("--role must be producer or acceptor");
const validateFixture = ajv.compile(load("schemas/fixture-case-0.1.0.schema.json"));
const paths = readdirSync(join(ROOT, "fixtures"), { withFileTypes: true }).filter(entry => entry.isDirectory())
  .flatMap(entry => readdirSync(join(ROOT, "fixtures", entry.name)).filter(name => name.endsWith(".json")).map(name => join(ROOT, "fixtures", entry.name, name)));
let failed = 0;
for (const path of paths) {
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  if (!validateFixture(fixture)) { console.error(`FAIL ${path}: fixture schema ${ajv.errorsText(validateFixture.errors)}`); failed++; continue; }
  const actual = evaluateFixture(fixture);
  if (actual !== fixture.expected.decision) { console.error(`FAIL ${fixture.case_id}: expected ${fixture.expected.decision}, got ${actual}`); failed++; }
  if (fixture.input.records && !fixture.input.identity_sequence && (fixture.expected.accepted !== undefined || fixture.expected.rejected !== undefined)) {
    const batch = validateBatch(fixture.input.records, { encodedBytes: fixture.input.encoded_bytes });
    if (fixture.expected.accepted !== undefined && batch.accepted !== fixture.expected.accepted) { console.error(`FAIL ${fixture.case_id}: accepted ${batch.accepted}`); failed++; }
    if (fixture.expected.rejected !== undefined && batch.rejected !== fixture.expected.rejected) { console.error(`FAIL ${fixture.case_id}: rejected ${batch.rejected}`); failed++; }
  }
}
if (failed) process.exitCode = 1;
else console.log(`PASS ${role}: ${paths.length} fixtures share one closed contract oracle`);
