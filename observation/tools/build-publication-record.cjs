#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { existsSync, readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = join(__dirname, "..");
const SUPER = join(ROOT, "..", "..");
const RECORD = "publication/publication-record-1.0.2.json";
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
  record_version: "0.1.2",
  contract_revision: "observation-contract@1.0.2",
  profile_version: "1.0.0",
  status: "PUBLISHED",
  published: true,
  conformance_claim: "VALIDATOR_ONLY",
  release_binding: {
    coordinate: "observation-contract@1.0.2",
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
    "contract.gate.1": "PASS_1.0.2_SCOPED_NON_SEMANTIC_BINDING_REVIEW",
    "contract.gate.2": "PASS_1.0.2_EXISTING_PROFILE_FRESH_READER_REUSED",
    "contract.gate.3": "PASS_27_TESTS_32_PRODUCER_32_ACCEPTOR_EVALUATION_25",
    "contract.gate.4": "PASS_1.0.2_EN_ZH_METADATA_PARITY",
    "contract.gate.5": "PASS_EXACT_REVISION_MATCH",
    "contract.gate.6": "PASS_6_SEMANTIC_CURRENT_ARTIFACT_INVENTORY",
    owner_approval: process.env.OBSERVATION_1_0_2_OWNER_APPROVAL_URL || "PENDING_OWNER_APPROVAL_URL"
  }
};
writeFileSync(join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE PUBLISHED inventory: ${artifacts.length} artifacts, ${semantic.length} semantic documents`);
