#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.resolve(ROOT, '..', 'workflow-dsl');
const GENERATED = path.join(ROOT, 'generated');
const SCHEMAS = path.join(GENERATED, 'schemas');
const EXAMPLE = path.join(GENERATED, 'examples', 'minimal');
const TOOLS = path.join(GENERATED, 'tools');
const VERSION_1 = 'agentops.workflow-dsl@1.1.0';
const VERSION_2 = 'agentops.workflow-dsl@2.0.0';

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const rawDigest = file => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
const canonicalDigest = value => {
  const ordered = input => Array.isArray(input)
    ? input.map(ordered)
    : input !== null && typeof input === 'object'
      ? Object.fromEntries(Object.keys(input).sort().map(key => [key, ordered(input[key])]))
      : input;
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(ordered(value)), 'utf8').digest('hex')}`;
};
const replaceVersion = value => JSON.parse(JSON.stringify(value).replaceAll(VERSION_1, VERSION_2));

fs.rmSync(GENERATED, { recursive: true, force: true });
fs.mkdirSync(SCHEMAS, { recursive: true });
fs.mkdirSync(EXAMPLE, { recursive: true });
fs.mkdirSync(TOOLS, { recursive: true });

for (const name of fs.readdirSync(path.join(SOURCE, 'schemas')).filter(name => name.endsWith('.json'))) {
  const schema = replaceVersion(readJson(path.join(SOURCE, 'schemas', name)));
  if (name === 'routes.schema.json') {
    const route = schema.properties.routes.items;
    route.required = route.required.filter(field => field !== 'agent');
    delete route.properties.agent;
    route.properties.resources.required = route.properties.resources.required.filter(field => field !== 'model');
    delete route.properties.resources.properties.model;
    schema.title = 'Agent Ops Route Catalog and execution-resource binding';
  }
  if (name === 'package.schema.json') {
    const kinds = schema.$defs.resourceEntry.properties.kind.enum;
    schema.$defs.resourceEntry.properties.kind.enum = kinds.filter(kind => !['agent-definition', 'model'].includes(kind));
  }
  if (name === 'roles.schema.json') schema.properties.roles.maxItems = 128;
  writeJson(path.join(SCHEMAS, name), schema);
}

const documents = {};
for (const name of ['workflow.json', 'actions.json', 'roles.json', 'routes.json', 'artifacts.json', 'validation.json']) {
  documents[name] = replaceVersion(readJson(path.join(SOURCE, 'examples', 'minimal', name)));
}
for (const route of documents['routes.json'].routes) {
  delete route.agent;
  delete route.resources.model;
}
for (const [name, value] of Object.entries(documents)) writeJson(path.join(EXAMPLE, name), value);

const pkg = replaceVersion(readJson(path.join(SOURCE, 'examples', 'minimal', 'package.json')));
pkg.compatibility.minContractVersion = '2.0.0';
pkg.compatibility.maxContractVersion = '2.0.0';
pkg.resources.owned = pkg.resources.owned.filter(resource => !['agent-definition', 'model'].includes(resource.kind));
pkg.resources.referenced = pkg.resources.referenced.filter(resource => !['agent-definition', 'model'].includes(resource.kind));
for (const resource of pkg.resources.owned) {
  const destination = path.join(EXAMPLE, resource.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(SOURCE, 'examples', 'minimal', resource.path), destination);
}
pkg.package.definition.contentIdentity = rawDigest(path.join(EXAMPLE, pkg.documents.workflow));
delete pkg.package.digest;
pkg.package.digest = canonicalDigest(pkg);
writeJson(path.join(EXAMPLE, 'package.json'), pkg);

const workflow = documents['workflow.json'];
const actions = documents['actions.json'];
const snapshot = replaceVersion(readJson(path.join(SOURCE, 'examples', 'minimal', 'snapshot.json')));
snapshot.snapshot.package.digest = pkg.package.digest;
snapshot.snapshot.definition.contentIdentity = pkg.package.definition.contentIdentity;
snapshot.snapshot.documents = Object.entries(pkg.documents).map(([kind, file]) => ({ kind, contentIdentity: rawDigest(path.join(EXAMPLE, file)) }));
snapshot.snapshot.resources = [...pkg.resources.owned, ...pkg.resources.referenced]
  .map(resource => ({ id: resource.id, owner: resource.owner, contentIdentity: resource.contentIdentity }));
snapshot.snapshot.routeBindings = actions.actions.flatMap(action => (action.allowedRoutes || []).map(route => ({
  action: action.id,
  role: action.responsibleAuthority.role,
  route,
})));
snapshot.snapshot.graph.nodes = workflow.graph.nodes.map(node => node.id);
snapshot.snapshot.graph.eventEdges = workflow.graph.eventEdges.map(edge => edge.id);
snapshot.snapshot.graph.dataEdges = workflow.dataflow.edges.map(edge => edge.id);
snapshot.snapshot.graph.hostOperations = (workflow.hostOperations || []).map(operation => operation.id);
snapshot.snapshot.graph.terminals = workflow.graph.terminals.map(terminal => terminal.id);
snapshot.snapshot.authority.mergeProof = canonicalDigest({
  authority: pkg.authority,
  routes: snapshot.snapshot.routeBindings,
  resources: snapshot.snapshot.resources,
});
delete snapshot.snapshot.digest;
snapshot.snapshot.digest = canonicalDigest(snapshot);
writeJson(path.join(EXAMPLE, 'snapshot.json'), snapshot);

let checker = fs.readFileSync(path.join(SOURCE, 'tools', 'check-example.cjs'), 'utf8').replaceAll(VERSION_1, VERSION_2);
checker = checker.replace(
  "    ['agent.definition', route.agent.definition, 'agent-definition'],\n    ['rolePrompt', route.resources.rolePrompt, 'role-prompt'],\n    ['model', route.resources.model, 'model'],",
  "    ['rolePrompt', route.resources.rolePrompt, 'role-prompt'],",
);
checker = checker.replace(
  "const boundInstructions = new Set();",
  "check(roles.roles.length <= 128, 'Role count exceeds 128');\nconst rolePromptBindings = new Map();\nconst boundInstructions = new Set();",
);
checker = checker.replace(
  "  for (const prompt of route.resources.actionPrompts) {",
  "  const rolePrompt = route.resources.rolePrompt.id;\n  const priorRolePrompt = rolePromptBindings.get(route.role);\n  check(priorRolePrompt === undefined || priorRolePrompt === rolePrompt, `role ${route.role} binds multiple Role prompts`);\n  rolePromptBindings.set(route.role, rolePrompt);\n  for (const prompt of route.resources.actionPrompts) {",
);
checker = checker.replace(
  "  check(roleIds.includes(route.role), `route ${route.id} role unknown`);",
  "  check(roleIds.includes(route.role), `route ${route.id} role unknown`);\n  check(route.agent === undefined, `route ${route.id} must not contain historical agent`);\n  check(route.resources.model === undefined, `route ${route.id} must not contain historical model`);",
);
checker = checker.replace(
  "const resourceIndex = new Map();",
  "const resourceIndex = new Map();\ncheck([...pkg.resources.owned, ...pkg.resources.referenced].every(resource => !['agent-definition', 'model'].includes(resource.kind)), 'historical agent/model resource kind');",
);
fs.writeFileSync(path.join(TOOLS, 'check-example.cjs'), checker);
fs.copyFileSync(path.join(SOURCE, 'tools', 'canonicalize.cjs'), path.join(TOOLS, 'canonicalize.cjs'));

console.log(`generated ${VERSION_2} standalone candidate at ${GENERATED}`);
