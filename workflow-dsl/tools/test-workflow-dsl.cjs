#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { spawnSync } = require('child_process');
const { createHash } = require('node:crypto');

const CONTRACT_ROOT = path.resolve(__dirname, '..');
const EXAMPLE_ROOT = path.join(CONTRACT_ROOT, 'examples', 'minimal');
const CHECKER = path.join(__dirname, 'check-example.cjs');
const RELEASE = 'agentops.workflow-dsl@1.0.0';

function runChecker(root) {
  return spawnSync(process.execPath, [CHECKER, root], { encoding: 'utf8' });
}

function withFixture(mutator, assertion) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-dsl-'));
  const fixtureRoot = path.join(tempRoot, 'minimal');
  fs.cpSync(EXAMPLE_ROOT, fixtureRoot, { recursive: true });
  try {
    mutator(fixtureRoot);
    assertion(runChecker(fixtureRoot));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function mutateJson(root, name, mutate) {
  const file = path.join(root, name);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(value);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function expectFailure(result, expected) {
  assert.notStrictEqual(result.status, 0, 'checker unexpectedly passed');
  assert.match(result.stderr, expected);
}

test('the canonical minimal Package passes every machine check', () => {
  const result = runChecker(EXAMPLE_ROOT);
  assert.strictEqual(result.status, 0, result.stderr);
});

test('the first frozen candidate uses the lifecycle-required 1.0.0 revision', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXAMPLE_ROOT, 'package.json'), 'utf8'));
  const workflow = JSON.parse(fs.readFileSync(path.join(EXAMPLE_ROOT, 'workflow.json'), 'utf8'));
  assert.strictEqual(pkg.schemaVersion, RELEASE);
  assert.strictEqual(pkg.compatibility.minContractVersion, '1.0.0');
  assert.strictEqual(pkg.compatibility.maxContractVersion, '1.0.0');
  assert.strictEqual(workflow.workflow.contractVersion, RELEASE);
});

test('version policy and publication binding remain explicit review-candidate evidence', () => {
  const policy = fs.readFileSync(path.join(CONTRACT_ROOT, 'VERSION_POLICY.md'), 'utf8');
  assert.match(policy, /agentops\.workflow-dsl@0\.1\.0.*NON_RESOLVING_LEGACY_HISTORY_ONLY/s);
  const publication = JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, 'publication', 'publication-record-1.0.0.json'), 'utf8'));
  assert.strictEqual(publication.contract_revision, RELEASE);
  assert.strictEqual(publication.status, 'REVIEW_CANDIDATE');
  assert.strictEqual(publication.published, false);
  assert.strictEqual(publication.conformance_claim, 'NONE');
  assert.ok(publication.artifacts.length > 0);
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const artifact of publication.artifacts) {
    assert.strictEqual(digest(path.join(CONTRACT_ROOT, artifact.path)), artifact.sha256, artifact.path);
  }
  const superRoot = path.join(CONTRACT_ROOT, '..', '..');
  assert.strictEqual(digest(path.join(superRoot, publication.semantic.path)), publication.semantic.sha256);
  for (const consumer of publication.consumer_bindings) {
    assert.strictEqual(digest(path.join(superRoot, consumer.path)), consumer.sha256, consumer.path);
  }
});

test('all eight normative schemas are present and valid JSON documents', () => {
  const schemaRoot = path.join(CONTRACT_ROOT, 'schemas');
  const expected = [
    'actions.schema.json',
    'agentops.meta.schema.json',
    'artifacts.schema.json',
    'package.schema.json',
    'roles.schema.json',
    'routes.schema.json',
    'validation.schema.json',
    'workflow-definition.schema.json'
  ];
  assert.deepStrictEqual(fs.readdirSync(schemaRoot).filter(name => name.endsWith('.json')).sort(), expected);
  for (const name of expected) JSON.parse(fs.readFileSync(path.join(schemaRoot, name), 'utf8'));
});

test('a companion document schemaVersion must match the Package version', () => {
  withFixture(
    root => mutateJson(root, 'actions.json', actions => { actions.schemaVersion = 'agentops.workflow-dsl@1.1.0'; }),
    result => expectFailure(result, /actions\.json: schemaVersion must match package\.schemaVersion/)
  );
});

test('schema validation rejects a vocabulary value outside the closed enum', () => {
  withFixture(
    root => mutateJson(root, 'actions.json', actions => { actions.actions[0].execution.mode = 'sequential'; }),
    result => expectFailure(result, /actions\.json: schema validation failed/)
  );
});

test('a budget evaluator registration must resolve through the resource index', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      workflow.budgets[0].evaluator.contentIdentity = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    }),
    result => expectFailure(result, /budget budget\.review-iterations evaluator is not an exact declared evaluator resource/)
  );
});

test('an undeclared Route reference fails closed', () => {
  withFixture(
    root => mutateJson(root, 'actions.json', actions => { actions.actions[0].allowedRoutes = ['route.missing']; }),
    result => expectFailure(result, /action action\.intake route route\.missing unknown/)
  );
});

test('a forbidden Runtime-native token fails closed', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => { workflow.workflow.purpose = 'Compile a StateGraph'; }),
    result => expectFailure(result, /forbidden physical field\/API token in Definition: 'stategraph'/)
  );
});
