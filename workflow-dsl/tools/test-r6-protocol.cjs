const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('R6 keeps eight root schemas plus one shared meta schema', () => {
  const schemas = fs.readdirSync(path.join(root, 'schemas')).filter(name => name.endsWith('.schema.json'));
  assert.deepEqual(schemas.sort(), [
    'actions.schema.json',
    'agentops.meta.schema.json',
    'artifacts.schema.json',
    'package-snapshot.schema.json',
    'package.schema.json',
    'roles.schema.json',
    'routes.schema.json',
    'validation.schema.json',
    'workflow-definition.schema.json'
  ]);
});

test('R6 minimal Definition declares typed dataflow and optional closed parallel selection', () => {
  const workflow = read('examples/minimal/workflow.json');
  assert.ok(Array.isArray(workflow.dataflow.edges));
  assert.ok(workflow.dataflow.edges.length > 0);

  const parallel = workflow.graph.nodes.find(node => node.kind === 'parallel');
  assert.ok(parallel);
  assert.deepEqual(parallel.selection, {
    source: { kind: 'state', field: 'selectedReviewLenses' }
  });
  assert.ok(parallel.branches.every(branch => branch.required === true));
});

test('R6 Route publishes exact session scope and structured Action capabilities', () => {
  const routes = read('examples/minimal/routes.json').routes;
  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.ok(['episode', 'data-bound'].includes(route.resources.sessionPolicy.scope.kind));
    assert.ok(['shared', 'isolated'].includes(route.resources.sessionPolicy.isolation));
    assert.ok(route.resources.capabilities.includes('structured-completion'));
    assert.equal(Object.hasOwn(route.resources.sessionPolicy, 'resumeRule'), false);
  }
});

test('R6 Definition publishes closed Host operation bindings without callbacks', () => {
  const workflow = read('examples/minimal/workflow.json');
  assert.ok(Array.isArray(workflow.hostOperations));
  assert.ok(workflow.hostOperations.length > 0);
  for (const operation of workflow.hostOperations) {
    assert.equal(typeof operation.contractIdentity, 'string');
    assert.ok(Array.isArray(operation.requiredCapabilities));
    assert.equal(Object.hasOwn(operation, 'callback'), false);
    assert.equal(Object.hasOwn(operation, 'module'), false);
  }
});
