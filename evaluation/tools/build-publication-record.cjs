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
  status: "REVIEW_CANDIDATE",
  published: false,
  conformance_claim: "NONE",
  source_revision: "WORKTREE_REVIEW_CANDIDATE",
  semantic: { path: semanticPath, sha256: existsSync(semanticAbsolute) ? digest(semanticAbsolute) : "PENDING_SUPERPROJECT_BINDING" },
  dependencies: catalog.dependencies,
  catalog_semantic_digest: "sha256:9bec66ff44e63e0f891c6b62162dcbe9252db1b169a30baa37fb4eb2994838ef",
  content_revision: revision(artifacts),
  artifacts,
  gates: {
    "contract.gate.1": "PENDING_INDEPENDENT_REVIEW",
    "contract.gate.2": "PENDING_FRESH_READER",
    "contract.gate.3": "CANDIDATE_VERIFIED",
    "contract.gate.4": "PENDING_INDEPENDENT_PARITY",
    "contract.gate.5": "CANDIDATE_REVISION_MATCH",
    "contract.gate.6": "CANDIDATE_BINDING_ONLY",
    owner_approval: "PENDING"
  }
};
mkdirSync(join(ROOT, "publication"), { recursive: true });
writeFileSync(join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE REVIEW_CANDIDATE inventory: ${record.artifacts.length} artifacts`);
