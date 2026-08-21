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
  return existsSync(root) ? walk(root).map(path => ({ path: `workflow-package/${scope}/${path}`, sha256: digest(join(root, path)) })) : [];
});
const record = {
  record_version: '1.0.0',
  contract_revision: 'agentops.workflow-dsl@1.0.0',
  status: 'FROZEN',
  published: true,
  conformance_claim: 'DEFINITION_AND_VALIDATOR_ONLY',
  source_revision: 'agentops.workflow-dsl@1.0.0',
  approved_candidate: {
    semantic_sha256: '57f870a9137dcc0d13f44c88362cd6962aa07d361adaab9a7fb5c9e56b7a19f5',
    translation_sha256: '13e7caf65b2fe8d5fd19efcc2a5dd17c45d83f309e1e61fb53ebc138334d1436',
    publication_record_sha256: 'e398bf64316ebe9d04bee7e6164714972c57884d64a5dc03eb546e66c030276f'
  },
  semantic: existsSync(semanticPath) ? { path: 'docs/contracts/workflow/workflow-definition-dsl.md', sha256: digest(semanticPath) } : { path: 'docs/contracts/workflow/workflow-definition-dsl.md', sha256: 'PENDING_SUPERPROJECT_BINDING' },
  artifacts: walk(ROOT).map(path => ({ path, sha256: digest(join(ROOT, path)) })),
  consumer_bindings: consumers,
  gates: {
    'contract.gate.1': 'PASS',
    'contract.gate.2': 'PASS',
    'contract.gate.3': 'PASS',
    'contract.gate.4': 'PASS',
    'contract.gate.5': 'PASS',
    'contract.gate.6': 'PASS',
    owner_approval: 'https://github.com/firestige/workflow-self-recursive/issues/77#issuecomment-5365978215'
  }
};
mkdirSync(join(ROOT, 'publication'), { recursive: true });
writeFileSync(join(ROOT, 'publication', 'publication-record-1.0.0.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(`WROTE FROZEN inventory: ${record.artifacts.length} artifacts, ${consumers.length} consumer files`);
