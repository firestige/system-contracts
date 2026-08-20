#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { spawnSync } = require('child_process');

const CONTRACT_ROOT = path.resolve(__dirname, '..');
const EXAMPLE_ROOT = path.join(CONTRACT_ROOT, 'examples', 'minimal');
const CHECKER = path.join(__dirname, 'check-example.cjs');

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
    root => mutateJson(root, 'actions.json', actions => { actions.schemaVersion = 'agentops.workflow-dsl@0.2.0'; }),
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
