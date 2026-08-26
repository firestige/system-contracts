#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = join(__dirname, "..");
const SUPERPROJECT = join(ROOT, "..", "..");
const RECORD = "publication/publication-record-0.1.0.json";
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

const semantic = {
  path: "docs/contracts/evidence-query/evidence-query.md",
  sha256: "ce13b76cb3c2737e8243c97de880574060a61c05a6a7a67182a2804c04a2a8ef",
};
const translation = {
  path: "docs/contracts/evidence-query/evidence-query.zh-CN.md",
  sha256: "d68b9f250bd608f0c6d46ace53bfa9f99241fe957f0184d320ecbceadd44ed3b",
};
for (const binding of [semantic, translation]) {
  if (sha256(join(SUPERPROJECT, binding.path)) !== binding.sha256) throw new Error("FROZEN_SEMANTIC_DIGEST_MISMATCH");
}

const artifacts = walk(ROOT).map(path => ({ path, sha256: sha256(join(ROOT, path)) }));
const record = {
  record_version: "0.1.0",
  contract_revision: "evidence.query@0.1.0",
  read_model_revision: "1.0.0",
  observation_profile: "1.0.0",
  status: "FROZEN",
  published: true,
  conformance_claim: "VALIDATOR_ONLY",
  schema_only_conformance: false,
  semantic,
  translation,
  candidate_publication: {
    repository: "firestige/system-contracts",
    tag: "evidence-query-0.1.0-rc.1",
    url: "https://github.com/firestige/system-contracts/releases/tag/evidence-query-0.1.0-rc.1",
    target_commit: "dc8a50e92eebfc35bd706579ff2bf5e9beb57782",
    release_metadata_sha256: "f869e51c3974f038c1f51c4c98e2110cfa90c97ed74e89fc837f052bc7ac41eb",
    publication_candidate_sha256: "97c3e158c18cd7e92da949d82a17b71c5e4bf08d081fef6e5f4b6dcb9c00c6a7",
    qualification_sha256: "bda43993fdc5197a3911e159a4ea47ac5020c1cb1ede095838519559a266cadc",
  },
  machine_candidate: {
    content_revision: "sha256:6d37245fbac11dde2967a7775efb541e00fb4c8b00c80011b91aef007346cfa1",
    artifact_count: 35,
  },
  legacy_isolation: "NOT_APPLICABLE_FIRST_RELEASE",
  content_revision: `sha256:${createHash("sha256").update(JSON.stringify(artifacts)).digest("hex")}`,
  artifacts,
  gates: {
    "contract.gate.1": "PASS",
    "contract.gate.2": "PASS",
    "contract.gate.3": "PASS_18_TESTS_17_FIXTURES_4_EXAMPLES",
    "contract.gate.4": "PASS_EN_ZH_PARITY",
    "contract.gate.5": "PASS_RC_TAG_AND_8_ASSET_MANIFEST",
    "contract.gate.6": "PASS_2_FINAL_SEMANTIC_35_MACHINE_ARTIFACT_BINDING",
    owner_approval: "https://github.com/firestige/workflow-self-recursive/issues/50#issuecomment-5427870271",
  },
};
mkdirSync(join(ROOT, "publication"), { recursive: true });
writeFileSync(join(ROOT, RECORD), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE FROZEN publication: ${artifacts.length} artifacts; ${record.content_revision}`);
