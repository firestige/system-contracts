#!/usr/bin/env node
const { createHash } = require('node:crypto');
const { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { join, relative } = require('node:path');

const ROOT = join(__dirname, '..');
const SUPER = join(ROOT, '..', '..');
const excluded = new Set(['.gitignore', 'publication/publication-record-1.0.0.json']);
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function walk(directory, base = directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name);
    const rel = relative(base, path);
    if (rel === 'node_modules' || rel.startsWith('node_modules/')) return [];
    if (statSync(path).isDirectory()) return walk(path, base);
    return excluded.has(rel) ? [] : [rel];
  });
}
const semanticPath = join(SUPER, 'docs', 'contracts', 'workflow', 'workflow-definition-dsl.md');
const consumers = ['implementation/definition', 'system-design/definition'].flatMap(scope => {
  const root = join(SUPER, 'workflow-package', scope);
  return existsSync(root) ? walk(root).filter(path => path.endsWith('.json')).map(path => ({ path: `workflow-package/${scope}/${path}`, sha256: digest(join(root, path)) })) : [];
});
const record = {
  record_version: '1.0.0',
  contract_revision: 'agentops.workflow-dsl@1.0.0',
  status: 'REVIEW_CANDIDATE',
  published: false,
  conformance_claim: 'NONE',
  source_revision: 'WORKTREE_REVIEW_CANDIDATE',
  semantic: existsSync(semanticPath) ? { path: 'docs/contracts/workflow/workflow-definition-dsl.md', sha256: digest(semanticPath) } : { path: 'docs/contracts/workflow/workflow-definition-dsl.md', sha256: 'PENDING_SUPERPROJECT_BINDING' },
  artifacts: walk(ROOT).map(path => ({ path, sha256: digest(join(ROOT, path)) })),
  consumer_bindings: consumers,
  gates: {
    'contract.gate.1': 'PENDING_INDEPENDENT_REVIEW',
    'contract.gate.2': 'PENDING_FRESH_READER',
    'contract.gate.3': 'CANDIDATE_VERIFIED',
    'contract.gate.4': 'PENDING_INDEPENDENT_PARITY',
    'contract.gate.5': 'CANDIDATE_REVISION_MATCH',
    'contract.gate.6': 'CANDIDATE_BINDING_ONLY',
    owner_approval: 'PENDING'
  }
};
mkdirSync(join(ROOT, 'publication'), { recursive: true });
writeFileSync(join(ROOT, 'publication', 'publication-record-1.0.0.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE REVIEW_CANDIDATE inventory: ${record.artifacts.length} artifacts, ${consumers.length} consumer files`);
