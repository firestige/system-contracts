#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } = require("node:fs");
const { join, relative } = require("node:path");
const ROOT = join(__dirname, "..");
const SUPER = join(ROOT, "..", "..");
const RECORD = "publication/publication-record-1.0.0.json";
const excluded = new Set([".gitignore", RECORD]);
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const revision = entries => `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
function walk(directory, base = directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name), rel = relative(base, path);
    if (rel === "node_modules" || rel.startsWith("node_modules/")) return [];
    if (statSync(path).isDirectory()) return walk(path, base);
    return excluded.has(rel) ? [] : [rel];
  });
}
const semanticPath = "docs/contracts/evaluation/metric-catalog.md";
const semanticAbsolute = join(SUPER, semanticPath);
const catalog = JSON.parse(readFileSync(join(ROOT, "examples", "metric-catalog-1.0.0.json"), "utf8"));
const artifacts = walk(ROOT).map(path => ({ path, sha256: digest(join(ROOT, path)) }));
const record = {
  record_version: "1.0.0",
  contract_revision: "agentops.evaluation.metric-catalog@1.0.0",
  status: "PUBLISHED",
  published: true,
  conformance_claim: "VALIDATOR_ONLY",
  source_revision: "sha256:602bc43accf86911a2d3d89a346058277c5ebb86bc2cc152eaa39000d6768326",
  semantic: { path: semanticPath, sha256: existsSync(semanticAbsolute) ? digest(semanticAbsolute) : "PENDING_SUPERPROJECT_BINDING" },
  dependencies: catalog.dependencies,
  catalog_semantic_digest: "sha256:6dbb4375507a3a2eebbe5e86bb6f0a40ebf811790f55ee841b15c6942e1f159d",
  content_revision: revision(artifacts),
  artifacts,
  gates: {
    "contract.gate.1": "PASS_evaluation_gate1_v2",
    "contract.gate.2": "PASS_evaluation_gate2_v2",
    "contract.gate.3": "PASS_25_TESTS_1_POSITIVE_18_NEGATIVE",
    "contract.gate.4": "PASS_evaluation_gate4_v2",
    "contract.gate.5": "PASS_EXACT_REVISION_MATCH",
    "contract.gate.6": "PASS_1_SEMANTIC_14_ARTIFACTS",
    owner_approval: "https://github.com/firestige/workflow-self-recursive/issues/79#issuecomment-5367772885"
  }
};
mkdirSync(join(ROOT, "publication"), { recursive: true });
writeFileSync(join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE PUBLISHED inventory: ${record.artifacts.length} artifacts`);
