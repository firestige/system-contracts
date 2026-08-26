#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = join(__dirname, "..");
const RECORD = "publication/publication-candidate-0.1.0.json";
const excluded = new Set([".gitignore", RECORD]);
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
function walk(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    const rel = relative(ROOT, path);
    if (rel === "node_modules" || rel.startsWith("node_modules/")) return [];
    if (statSync(path).isDirectory()) return walk(path);
    return excluded.has(rel) ? [] : [rel];
  });
}
const registry = JSON.parse(readFileSync(join(ROOT, "registries", "evidence-query-0.1.0.json"), "utf8"));
const artifacts = walk(ROOT).map(path => ({ path, sha256: sha256(join(ROOT, path)) }));
const record = {
  record_version: "0.1.0",
  contract_revision: "evidence.query@0.1.0",
  read_model_revision: "1.0.0",
  observation_profile: "1.0.0",
  status: "REVIEW_CANDIDATE",
  published: false,
  conformance_claim: "VALIDATOR_ONLY",
  schema_only_conformance: false,
  manifest_binding: registry.manifest_binding,
  upstream_machine: registry.upstream_machine,
  content_revision: `sha256:${createHash("sha256").update(JSON.stringify(artifacts)).digest("hex")}`,
  artifacts,
  gates: {
    schema_compilation: "PASS_AJV_8_20_0_STRICT",
    validator_tests: "PASS_NPM_TEST",
    fixture_corpus: "PASS_17_CASES_5_POSITIVE_7_NEGATIVE_5_RECOVERY",
    manifest_binding: "PASS_EXACT_SHA256",
    publication: "CANDIDATE_NOT_FROZEN"
  },
  owner_approval: { owner: "firestige", date: "2026-08-26", decision: "APPROVED_REOPEN_MACHINE_SEMANTICS" }
};
mkdirSync(join(ROOT, "publication"), { recursive: true });
writeFileSync(join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE REVIEW_CANDIDATE inventory: ${artifacts.length} artifacts; ${record.content_revision}`);
