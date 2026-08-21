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
const CORPUS_RUNNER = path.join(__dirname, 'run-conformance.cjs');

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
}

function withFixture(mutator, assertion) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-dsl-wave6-'));
  const fixtureRoot = path.join(tempRoot, 'minimal');
  fs.cpSync(EXAMPLE_ROOT, fixtureRoot, { recursive: true });
  try {
    mutator(fixtureRoot);
    assertion(run(CHECKER, [fixtureRoot]));
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

test('the normative schema set includes the Package Snapshot schema', () => {
  const schemaRoot = path.join(CONTRACT_ROOT, 'schemas');
  const names = fs.readdirSync(schemaRoot).filter(name => name.endsWith('.json'));
  assert.ok(names.includes('package-snapshot.schema.json'));
});

test('canonical JSON gives the same digest regardless of object member order', () => {
  const { canonicalize, canonicalDigest } = require('./canonicalize.cjs');
  assert.strictEqual(
    canonicalDigest({ z: 1, nested: { b: true, a: [2, 1] } }),
    canonicalDigest({ nested: { a: [2, 1], b: true }, z: 1 })
  );
  assert.strictEqual(canonicalize(1e21), '1e+21');
  assert.ok(canonicalize({ '\uE000': 1, '😀': 2 }).indexOf('😀') < canonicalize({ '\uE000': 1, '😀': 2 }).indexOf('\uE000'));
  assert.throws(() => canonicalize('\uD800'), /Unicode scalar/);
});

test('the minimal Package uses graph-level parallel and binds a valid Snapshot', () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(EXAMPLE_ROOT, 'workflow.json'), 'utf8'));
  const actions = JSON.parse(fs.readFileSync(path.join(EXAMPLE_ROOT, 'actions.json'), 'utf8'));
  assert.ok(workflow.graph.nodes.some(node => node.kind === 'parallel'));
  assert.ok(actions.actions.every(action => action.execution === undefined));
  const result = run(CHECKER, [EXAMPLE_ROOT]);
  assert.strictEqual(result.status, 0, result.stderr);
});

test('a parallel branch cannot be optional', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const parallel = workflow.graph.nodes.find(node => node.kind === 'parallel');
      parallel.branches[0].required = false;
    }),
    result => expectFailure(result, /schema validation failed/)
  );
});

test('a parallel node cannot carry Action or Role authority', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const parallel = workflow.graph.nodes.find(node => node.kind === 'parallel');
      parallel.action = 'action.review.blackbox';
    }),
    result => expectFailure(result, /schema validation failed/)
  );
});

test('Planner self and mutual cycles fail admission', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const first = workflow.graph.nodes.find(node => node.id === 'node.intake');
      first.routing = {
        kind: 'semantic',
        branches: [{ id: 'branch.accept', meaning: 'Accept the request', target: first.id }],
        fallback: { kind: 'question', target: 'node.wait-confirm' }
      };
    }),
    result => expectFailure(result, /planner invocation cycle/)
  );
});

test('semantic routing branch identities must be unique', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const intake = workflow.graph.nodes.find(node => node.id === 'node.intake');
      intake.routing = {
        kind: 'semantic',
        branches: [
          { id: 'branch.duplicate', meaning: 'First meaning', target: 'node.review' },
          { id: 'branch.duplicate', meaning: 'Second meaning', target: 'node.finalize' }
        ],
        fallback: { kind: 'question', target: 'node.wait-confirm' }
      };
    }),
    result => expectFailure(result, /duplicate semantic branch identity on node\.intake/)
  );
});

test('deterministic routing cases cover each closed result value exactly once', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const intake = workflow.graph.nodes.find(node => node.id === 'node.intake');
      intake.routing.cases = [
        { value: 'confirmed', target: 'node.review' },
        { value: 'confirmed', target: 'node.finalize' }
      ];
    }),
    result => expectFailure(result, /routing cases must cover each result value exactly once/)
  );
});

test('Wait and wait-renewal nodes cannot have ordinary outgoing edges', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      workflow.graph.edges.push({ id: 'edge.wait-configurable-resume', from: 'node.wait-confirm', to: 'node.finalize' });
    }),
    result => expectFailure(result, /node node\.wait-confirm cannot have an ordinary outgoing edge/)
  );
});

test('missing, duplicate, and incompatible typed event routes fail admission', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      workflow.graph.eventEdges = workflow.graph.eventEdges.filter(edge => edge.event !== 'cancelled');
    }),
    result => expectFailure(result, /missing event edge/)
  );
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const edge = workflow.graph.eventEdges.find(candidate => candidate.event === 'cancelled');
      workflow.graph.eventEdges.push({ ...edge, id: `${edge.id}.duplicate` });
    }),
    result => expectFailure(result, /duplicate event edge/)
  );
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const edge = workflow.graph.eventEdges.find(candidate => candidate.event === 'wait-expired');
      edge.to = 'terminal:SUCCESS';
    }),
    result => expectFailure(result, /incompatible event target/)
  );
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      workflow.graph.nodes.find(node => node.kind === 'wait').budget = workflow.budgets[0].id;
    }),
    result => expectFailure(result, /missing event edge for node\.wait-confirm:budget-exhausted/)
  );
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      workflow.graph.edges.push({ id: 'edge.finalize.extra', from: 'node.finalize', to: 'node.intake' });
      workflow.graph.edges.push({ id: 'edge.finalize.extra-2', from: 'node.finalize', to: 'node.wait-confirm' });
    }),
    result => expectFailure(result, /node node\.finalize has multiple ordinary successors without routing/)
  );
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      workflow.graph.nodes.push({ id: 'node.cleanup-failure', kind: 'cleanup', disposition: 'failure', action: 'action.finalize' });
      workflow.graph.edges.push({ id: 'edge.cleanup-retry', from: 'node.cleanup-failure', to: 'node.finalize' });
      workflow.graph.eventEdges.push(
        { id: 'event.cleanup.cancelled', from: 'node.cleanup-failure', event: 'cancelled', to: 'terminal:FAILED' },
        { id: 'event.cleanup.failed', from: 'node.cleanup-failure', event: 'nonretryable-failure', to: 'terminal:FAILED' }
      );
    }),
    result => expectFailure(result, /cleanup node\.cleanup-failure reaches non-cleanup node node\.finalize/)
  );
});

test('closed reducer pairs and resource identities fail closed', () => {
  withFixture(
    root => mutateJson(root, 'workflow.json', workflow => {
      const parallel = workflow.graph.nodes.find(node => node.kind === 'parallel');
      parallel.join = { kind: 'reducer', operator: 'sum', inputType: 'boolean' };
    }),
    result => expectFailure(result, /schema validation failed/)
  );
  withFixture(
    root => mutateJson(root, 'package.json', pkg => {
      pkg.resources.referenced.push({ ...pkg.resources.referenced[0] });
    }),
    result => expectFailure(result, /duplicate resource identity/)
  );
  withFixture(
    root => mutateJson(root, 'validation.json', validation => {
      validation.review.find(review => review.id === 'review.whitebox').admission.findingShape = 'artifact.findings';
    }),
    result => expectFailure(result, /findingShape must be produced by its exact Reviewer Action/)
  );
});

test('a changed Snapshot digest fails admission', () => {
  withFixture(
    root => mutateJson(root, 'snapshot.json', snapshot => {
      snapshot.snapshot.digest = 'sha256:' + '0'.repeat(64);
    }),
    result => expectFailure(result, /snapshot digest mismatch/)
  );
});

test('the executable positive, negative, and recovery corpus matches every oracle', () => {
  const result = run(CORPUS_RUNNER, [EXAMPLE_ROOT]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /positive=.*negative=.*recovery=/);
});
