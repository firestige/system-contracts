const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'delivery-admission-contract.json'), 'utf8'));

test('publishes the exact R6 authority and output projection', () => {
  assert.equal(contract.identity, 'agentops.delivery-admission@1.0.0');
  assert.equal(contract.authority.sha256, '15cf813930151dfb674218388eb48a09c581c4f75e33f44de2a7f353e5c791bc');
  assert.equal(contract.consumes.workflowContract, 'agentops.workflow-dsl@1.1.0');
  assert.deepEqual([contract.consumes.documents, contract.consumes.rootSchemas, contract.consumes.sharedMetaSchemas], [8, 8, 1]);
  assert.equal(contract.produces.schemaVersion, 'runner.activation@1.0.0');
});

test('freezes physical bindings and explicit selection without an All|Selected mode', () => {
  const inputs = contract.bindingRules.flatMap(rule => rule.inputs ?? []);
  assert.ok(inputs.includes('selection-source'));
  assert.ok(inputs.includes('workspace-path'));
  assert.ok(contract.failClosed.includes('empty-explicit-selection'));
  assert.equal(JSON.stringify(contract).includes('All|Selected'), false);
});

test('publication binds the real TypeScript activation and validator projections', () => {
  const publication = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'publication', 'publication-record-1.0.0.json'), 'utf8'));
  assert.deepEqual(publication.projections.map(projection => projection.path), [
    'execution-system/src/contracts/runner-activation.ts',
    'execution-system/src/contracts/compiler.ts'
  ]);
  assert.ok(publication.projections.every(projection => /^[a-f0-9]{64}$/.test(projection.sha256)));
});
