const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CHECKER = path.join(ROOT, 'generated', 'tools', 'check-example.cjs');
const MINIMAL = path.join(ROOT, 'generated', 'examples', 'minimal');

function check(root) {
  return spawnSync(process.execPath, [CHECKER, root], { encoding: 'utf8' });
}

function mutate(mutator) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-dsl-2-candidate-'));
  fs.cpSync(MINIMAL, root, { recursive: true });
  mutator(root);
  return root;
}

test('standalone 2.0 candidate accepts its generated minimal package', () => {
  const result = check(MINIMAL);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});

test('published 1.1 package remains 1.1 and is rejected by exact 2.0 dispatch', () => {
  const published = path.resolve(ROOT, '..', 'workflow-dsl', 'examples', 'minimal');
  const result = check(published);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /schemaVersion|package\.schemaVersion/);
});

test('historical Route agent and model fields are rejected', () => {
  for (const field of ['agent', 'model']) {
    const root = mutate(directory => {
      const file = path.join(directory, 'routes.json');
      const routes = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (field === 'agent') routes.routes[0].agent = { definition: { id: 'agent.old' }, managedProjection: 'required' };
      else routes.routes[0].resources.model = { id: 'model.old' };
      fs.writeFileSync(file, `${JSON.stringify(routes, null, 2)}\n`);
    });
    const result = check(root);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /additional properties|historical/iu);
  }
});

test('historical resource kinds, more than 128 Roles, and split Role prompts are rejected', () => {
  const oldResource = mutate(directory => {
    const file = path.join(directory, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    pkg.resources.referenced.push({ id: 'model.old', kind: 'model', owner: 'referenced', contentIdentity: `sha256:${'a'.repeat(64)}`, use: 'old', sourceLocator: { repository: 'x/y', path: 'model' } });
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  });
  assert.notEqual(check(oldResource).status, 0);

  const tooMany = mutate(directory => {
    const file = path.join(directory, 'roles.json');
    const roles = JSON.parse(fs.readFileSync(file, 'utf8'));
    roles.roles = Array.from({ length: 129 }, (_, index) => ({ ...roles.roles[0], id: `role${index}` }));
    fs.writeFileSync(file, `${JSON.stringify(roles, null, 2)}\n`);
  });
  assert.notEqual(check(tooMany).status, 0);

  const splitPrompt = mutate(directory => {
    const file = path.join(directory, 'routes.json');
    const routes = JSON.parse(fs.readFileSync(file, 'utf8'));
    routes.routes[1].resources.rolePrompt = { id: 'role.prompt.reviewer' };
    fs.writeFileSync(file, `${JSON.stringify(routes, null, 2)}\n`);
  });
  const split = check(splitPrompt);
  assert.notEqual(split.status, 0);
  assert.match(`${split.stderr}\n${split.stdout}`, /multiple Role prompts|digest mismatch/iu);
});
