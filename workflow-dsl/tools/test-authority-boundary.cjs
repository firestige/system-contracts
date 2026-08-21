#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CONTRACT_ROOT = path.resolve(__dirname, '..');
const EXAMPLE_ROOT = path.join(CONTRACT_ROOT, 'examples', 'minimal');
const CHECKER = path.join(__dirname, 'check-example.cjs');

function runCase(mutator) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-authority-'));
  const fixtureRoot = path.join(tempRoot, 'minimal');
  fs.cpSync(EXAMPLE_ROOT, fixtureRoot, { recursive: true });
  try {
    mutator(fixtureRoot);
    return spawnSync(process.execPath, [CHECKER, fixtureRoot], { encoding: 'utf8' });
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

function expectAuthorityFailure(name, mutator, expected) {
  const result = runCase(mutator);
  assert.notStrictEqual(result.status, 0, `${name}: checker unexpectedly passed`);
  assert.match(result.stderr, expected, `${name}: expected authority failure was not reported`);
}

expectAuthorityFailure(
  'Action Prompt cannot attach through an unauthorized Route',
  root => mutateJson(root, 'routes.json', routes => {
    routes.routes.find(route => route.id === 'route.reviewer.blackbox').resources.actionPrompts.push({
      action: 'action.aggregate',
      prompt: { id: 'prompt.aggregate' }
    });
  }),
  /route route\.reviewer\.blackbox binds action\.aggregate without Action authorization/
);

expectAuthorityFailure(
  'a responsible Role needs a non-empty Workflow authority boundary',
  root => mutateJson(root, 'roles.json', roles => {
    roles.roles.find(role => role.id === 'role.facilitator').authorityBoundary.concerns = [];
  }),
  /authorityBoundary\/concerns must NOT have fewer than 1 items|role role\.facilitator needs a non-empty Workflow authority concern boundary/
);

expectAuthorityFailure(
  'an instruction-bearing resource cannot remain unbound',
  root => mutateJson(root, 'package.json', pkg => {
    pkg.resources.referenced.push({
      id: 'skill.orphan',
      kind: 'skill',
      owner: 'referenced',
      sourceLocator: {
        repository: 'workflow-package',
        path: '.agents/skills/orphan/SKILL.md',
        ref: 'main'
      },
      contentIdentity: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      use: 'unbound instruction resource for the negative fixture'
    });
  }),
  /instruction resource skill\.orphan is not bound through any route/
);

expectAuthorityFailure(
  'resource bindings are kind-exact',
  root => mutateJson(root, 'routes.json', routes => {
    routes.routes.find(route => route.id === 'route.facilitator.intake').resources.rolePrompt.id = 'prompt.intake';
  }),
  /route route\.facilitator\.intake rolePrompt prompt\.intake must reference kind role-prompt/
);

console.log('PASS: Workflow authority boundary negatives rejected');
