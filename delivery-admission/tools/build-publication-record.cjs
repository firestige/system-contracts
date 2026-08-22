const { createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const superRoot = path.join(root, '..', '..');
const artifacts = ['README.md', 'delivery-admission-contract.json', 'package.json', 'tools/build-publication-record.cjs', 'tools/test-contract.cjs'];
const sha256 = file => createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');
const record = {
  recordVersion: '1.0.0',
  contractIdentity: 'agentops.delivery-admission@1.0.0',
  status: 'FROZEN',
  authoritySha256: '15cf813930151dfb674218388eb48a09c581c4f75e33f44de2a7f353e5c791bc',
  artifacts: artifacts.map(file => ({ path: file, sha256: sha256(file) })),
  projections: [
    'execution-system/src/contracts/runner-activation.ts',
    'execution-system/src/contracts/compiler.ts'
  ].map(file => ({ path: file, sha256: createHash('sha256').update(readFileSync(path.join(superRoot, file))).digest('hex') }))
};
mkdirSync(path.join(root, 'publication'), { recursive: true });
writeFileSync(path.join(root, 'publication', 'publication-record-1.0.0.json'), `${JSON.stringify(record, null, 2)}\n`);
