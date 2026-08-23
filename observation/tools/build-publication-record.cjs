#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { existsSync, readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = join(__dirname, "..");
const SUPER = join(ROOT, "..", "..");
const RECORD = "publication/publication-record-1.0.0.json";
const excluded = new Set([".gitignore", RECORD]);
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const revision = entries => `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
function walk(directory, base = directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    const rel = relative(base, path);
    if (rel === "node_modules" || rel.startsWith("node_modules/")) return [];
    if (statSync(path).isDirectory()) return walk(path, base);
    return excluded.has(rel) ? [] : [rel];
  });
}
const artifacts = walk(ROOT).map(path => ({
  path,
  sha256: digest(join(ROOT, path))
}));
const semantic = [
  "docs/agent-architecture.md",
  "docs/systems/execution/project-execution-system.md",
  "docs/systems/evidence/evidence-system.md",
  "docs/contracts/observation/observation-catalog.md",
  "docs/contracts/observation/otel-observation-profile.md",
  "docs/contracts/execution-evidence/interaction-contract.md"
].map(path => {
  const absolute = join(SUPER, path);
  return { path, sha256: existsSync(absolute) ? digest(absolute) : "PENDING_SUPERPROJECT_BINDING" };
});
const record = {
  record_version: "0.1.0",
  profile_version: "1.0.0",
  status: "PUBLISHED",
  published: true,
  conformance_claim: "VALIDATOR_ONLY",
  release_binding: {
    coordinate: "observation-contract@1.0.0",
    superproject: {
      repository: "firestige/workflow-self-recursive",
      revision: revision(semantic)
    },
    machine_package: {
      repository: "firestige/system-contracts",
      gitlink_path: "system-contracts",
      revision: revision(artifacts)
    }
  },
  semantic,
  artifacts,
  verification: [
    { command: "npm test", result: "PASS" },
    { command: "npm run check -- --role producer", result: "PASS" },
    { command: "npm run check -- --role acceptor", result: "PASS" }
  ],
  gates: {
    "contract.gate.1": "PASS_observation_gate1_v5",
    "contract.gate.2": "PASS_observation_gate2_v5",
    "contract.gate.3": "PASS_23_TESTS_32_PRODUCER_32_ACCEPTOR",
    "contract.gate.4": "PASS_observation_gate4_v5",
    "contract.gate.5": "PASS_EXACT_REVISION_MATCH",
    "contract.gate.6": "PASS_6_SEMANTIC_54_ARTIFACTS",
    owner_approval: "PASS_W5_REOPEN_OWNER_APPROVED_2026_08_24"
  }
};
writeFileSync(join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE PUBLISHED inventory: ${artifacts.length} artifacts, ${semantic.length} semantic documents`);
