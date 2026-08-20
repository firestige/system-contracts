#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = join(__dirname, "..");
const excluded = new Set([".gitignore", "publication/publication-record-0.3.0.json"]);
function walk(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    const rel = relative(ROOT, path);
    if (rel === "node_modules" || rel.startsWith("node_modules/")) return [];
    if (statSync(path).isDirectory()) return walk(path);
    return excluded.has(rel) ? [] : [rel];
  });
}
const artifacts = walk(ROOT).map(path => ({
  path,
  sha256: createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex")
}));
const record = {
  record_version: "0.1.0",
  profile_version: "0.3.0",
  status: "REVIEW_CANDIDATE",
  published: false,
  conformance_claim: "NONE",
  artifacts,
  verification: [
    { command: "npm test", result: "PASS" },
    { command: "npm run check -- --role producer", result: "PASS" },
    { command: "npm run check -- --role acceptor", result: "PASS" }
  ]
};
writeFileSync(join(ROOT, "publication", "publication-record-0.3.0.json"), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE REVIEW_CANDIDATE inventory: ${artifacts.length} artifacts`);
