#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalDigest } = require('./canonicalize.cjs');

const root = path.resolve(__dirname, '..', 'examples', 'minimal');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const digest = relative => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')}`;
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);

const pkg = read('package.json');
const workflow = read(pkg.documents.workflow);
const actions = read(pkg.documents.actions);
pkg.package.definition.contentIdentity = digest(pkg.documents.workflow);
pkg.compatibility.maxContractVersion = '1.1.0';
delete pkg.package.digest;
pkg.package.digest = canonicalDigest(pkg);
write('package.json', pkg);

const snapshot = read('snapshot.json');
snapshot.schemaVersion = pkg.schemaVersion;
snapshot.snapshot.package.digest = pkg.package.digest;
snapshot.snapshot.definition.contentIdentity = pkg.package.definition.contentIdentity;
snapshot.snapshot.documents = Object.entries(pkg.documents).map(([kind, file]) => ({ kind, contentIdentity: digest(file) }));
snapshot.snapshot.routeBindings = actions.actions.flatMap(action => (action.allowedRoutes || []).map(route => ({
  action: action.id,
  role: action.responsibleAuthority.role,
  route
})));
snapshot.snapshot.graph.nodes = workflow.graph.nodes.map(node => node.id);
snapshot.snapshot.graph.eventEdges = workflow.graph.eventEdges.map(edge => edge.id);
snapshot.snapshot.graph.dataEdges = workflow.dataflow.edges.map(edge => edge.id);
snapshot.snapshot.graph.hostOperations = (workflow.hostOperations || []).map(operation => operation.id);
snapshot.snapshot.graph.terminals = workflow.graph.terminals.map(terminal => terminal.id);
delete snapshot.snapshot.digest;
snapshot.snapshot.digest = canonicalDigest(snapshot);
write('snapshot.json', snapshot);
