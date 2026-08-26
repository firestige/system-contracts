#!/usr/bin/env node
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const validator = require("./validator.cjs");

const ROOT = join(__dirname, "..");
function jsonFiles(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? jsonFiles(path) : path.endsWith(".json") ? [path] : [];
  });
}
const fixturePaths = jsonFiles(join(ROOT, "fixtures"));
const counts = { positive: 0, negative: 0, recovery: 0 };
const failures = [];
for (const path of fixturePaths) {
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  if (!validator.fixtureOracle(fixture)) failures.push(`${path}: invalid fixture envelope`);
  else if (validator.evaluateFixture(fixture) !== fixture.expected) failures.push(`${path}: oracle outcome differs from ${fixture.expected}`);
  counts[fixture.category] += 1;
}
const examples = [
  ["facts-response-0.1.0.json", value => validator.validateResponse(value, "facts")],
  ["traces-response-0.1.0.json", value => validator.validateResponse(value, "traces")],
  ["expiry-record-1.0.0.json", validator.validateInternalValue],
  ["expiry-batch-1.0.0.json", validator.validateInternalValue]
];
for (const [name, oracle] of examples) {
  const result = oracle(JSON.parse(readFileSync(join(ROOT, "examples", name), "utf8")));
  if (!result.valid) failures.push(`${name}: ${result.errors.join("; ")}`);
}
const binding = validator.verifyManifestBinding();
if (!binding.valid) failures.push(...binding.errors);
if (failures.length) {
  console.error(`FAIL:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else console.log(`PASS: ${fixturePaths.length} fixtures (${counts.positive} positive, ${counts.negative} negative, ${counts.recovery} recovery), ${examples.length} examples, exact manifest binding`);
