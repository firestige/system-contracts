#!/usr/bin/env node
// Agent Ops Workflow DSL — example closure checker (ad hoc, not part of the Contract)
// Verifies: JSON validity, kind/schemaVersion, required fields, reference resolution,
// closed vocabularies, canonical authority order, Action→Route/instruction/resource-kind authority bindings,
// allowedSuccessors == graph out-edges,
// no static-edge+conditional-edge mix, no LangGraph/Driver physical fields, real digests.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] || '.';
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const sha256 = (p) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');

let errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const has = (obj, id) => obj && obj.some(x => x.id === id);

// 1. Load all documents
const pkg = read('package.json');
const wf = read(pkg.documents.workflow);
const acts = read(pkg.documents.actions);
const roles = read(pkg.documents.roles);
const routes = read(pkg.documents.routes);
const arts = read(pkg.documents.artifacts);
const val = read(pkg.documents.validation);

const kinds = { 'package.json': 'agentops.package', [pkg.documents.workflow]: 'agentops.workflow-definition', [pkg.documents.actions]: 'agentops.actions', [pkg.documents.roles]: 'agentops.roles', [pkg.documents.routes]: 'agentops.routes', [pkg.documents.artifacts]: 'agentops.artifacts', [pkg.documents.validation]: 'agentops.validation' };
for (const [file, kind] of Object.entries(kinds)) check(read(file).kind === kind, `${file}: kind mismatch (expected ${kind})`);

// 2. Package identity
check(pkg.schemaVersion === 'agentops.workflow-dsl@0.1.0', 'package.schemaVersion');
check(pkg.authority.order.join(',') === 'workflow_action,role_prompt,action_prompt,skill,artifact_user', 'authority order must be canonical');
check(pkg.authority.conflictMode === 'fail-closed', 'conflictMode fail-closed');
check(pkg.package.definition.contentIdentity === sha256(pkg.documents.workflow), 'definition.contentIdentity must equal sha256(workflow.json)');

// 3. Owned resources: files exist and digests match; referenced: sourceLocator present
const resIndex = {};
for (const o of pkg.resources.owned) {
  check(fs.existsSync(path.join(ROOT, o.path)), `owned resource file missing: ${o.path}`);
  if (fs.existsSync(path.join(ROOT, o.path))) check(o.contentIdentity === sha256(o.path), `owned digest mismatch: ${o.id} (${o.path})`);
  check(!o.sourceLocator, `owned resource must not have sourceLocator: ${o.id}`);
  resIndex[o.id] = o;
}
for (const r of pkg.resources.referenced) {
  check(r.sourceLocator && r.sourceLocator.repository && r.sourceLocator.path, `referenced resource needs sourceLocator: ${r.id}`);
  check(!r.path, `referenced resource must not have path: ${r.id}`);
  check(/^sha256:[0-9a-f]{64}$/.test(r.contentIdentity), `malformed contentIdentity: ${r.id}`);
  resIndex[r.id] = r;
}
const checkResourceKind = (routeId, binding, ref, expectedKind) => {
  if (!resIndex[ref.id]) return;
  check(
    resIndex[ref.id].kind === expectedKind,
    `route ${routeId} ${binding} ${ref.id} must reference kind ${expectedKind}`
  );
};

// 4. Workflow definition
const nodeIds = wf.graph.nodes.map(n => n.id);
const termIds = wf.graph.terminals.map(t => t.id);
const actionIds = acts.actions.map(a => a.id);
check(nodeIds.includes(wf.graph.start), 'graph.start must be a node');
for (const n of wf.graph.nodes) check(actionIds.includes(n.action), `node ${n.id} action ${n.action} must exist`);
// static edges + conditional edges: node may have either, not both
const hasStaticOut = {}, hasCondOut = {};
for (const e of wf.graph.edges || []) { hasStaticOut[e.from] = true; check(nodeIds.includes(e.from), `edge ${e.id} from unknown node ${e.from}`); }
for (const ce of wf.graph.conditionalEdges || []) {
  hasCondOut[ce.source] = true;
  check(nodeIds.includes(ce.source), `conditionalEdge ${ce.id} source unknown`);
  if (ce.judge && ce.judge.kind === 'planner') {
    check(actionIds.includes(ce.judge.action), `conditionalEdge ${ce.id} planner judge action ${ce.judge.action} unknown`);
  }
}
for (const id of Object.keys(hasStaticOut)) check(!hasCondOut[id], `node ${id} mixes static and conditional out-edges`);
const outEdges = {}; // node -> set of targets
for (const e of wf.graph.edges || []) { (outEdges[e.from] = outEdges[e.from] || new Set()).add(e.to); }
for (const ce of wf.graph.conditionalEdges || []) {
  for (const c of ce.conditions) { (outEdges[ce.source] = outEdges[ce.source] || new Set()).add(c.target); }
  if (ce.default) (outEdges[ce.source] = outEdges[ce.source] || new Set()).add(ce.default);
}
const allTargets = [...new Set(Object.values(outEdges).flatMap(s => [...s]))];
for (const t of allTargets) {
  check(t.startsWith('terminal:') ? termIds.includes(t.slice(9)) : nodeIds.includes(t), `edge target unknown: ${t}`);
}
// terminals referenced by validation
for (const t of wf.graph.terminals) for (const v of t.validation || []) check(has(val.validators, v), `terminal ${t.id} validator ${v} unknown`);
// state reducer vocab
const REDUCERS = ['overwrite', 'append', 'merge', 'keepFirst', 'sum', 'max', 'min'];
for (const f of wf.state.fields) {
  const r = f.reducer || 'overwrite';
  check(REDUCERS.includes(r) || (typeof r === 'object' && r.custom), `state field ${f.name} invalid reducer`);
  check(f.type === 'array' ? f.items : true, `state field ${f.name} array needs items`);
}
// waits / budgets / recovery
const waitIds = (wf.waits || []).map(w => w.id), budgetIds = (wf.budgets || []).map(b => b.id), recIds = (wf.recovery || []).map(r => r.id);
for (const w of wf.waits || []) { check(actionIds.includes(w.triggerAction), `wait ${w.id} triggerAction unknown`); check(actionIds.includes(w.resumeAction), `wait ${w.id} resumeAction unknown`); check(w.correlation.staleRejected && w.correlation.duplicateRejected, `wait ${w.id} correlation must reject stale+duplicate`); }
for (const b of wf.budgets || []) {
  if (b.scope === 'action') check(actionIds.includes(b.action), `budget ${b.id} action unknown`);
  check(b.evaluator && b.evaluator.path && /^sha256:[0-9a-f]{64}$/.test(b.evaluator.contentIdentity), `budget ${b.id} needs evaluator registration point (schemaRef)`);
  if (b.resource === 'custom') check(typeof b.resourceName === 'string' && b.resourceName.length > 0, `budget ${b.id} custom resource needs resourceName`);
}
for (const r of wf.recovery || []) { if (r.action) check(actionIds.includes(r.action), `recovery ${r.id} action unknown`); check(r.noBlindReplay === true, `recovery ${r.id} must declare noBlindReplay`); }
for (const h of wf.handoffs || []) check(h.semanticOnly === true, `handoff ${h.id} must be semanticOnly`);
for (const c of wf.consumedHandoffs || []) check(c.mustNotWeaken === true, `consumedHandoff ${c.id} must declare mustNotWeaken`);

// 5. Actions
const routeIds = routes.routes.map(r => r.id);
const roleIds = roles.roles.map(r => r.id);
for (const role of roles.roles) {
  check(
    role.authorityBoundary && Array.isArray(role.authorityBoundary.concerns) && role.authorityBoundary.concerns.length > 0,
    `role ${role.id} needs a non-empty Workflow authority concern boundary`
  );
}
for (const a of acts.actions) {
  const isRoleAction = a.responsibleAuthority.kind === 'role';
  if (isRoleAction) check(Array.isArray(a.allowedRoutes) && a.allowedRoutes.length >= 1, `action ${a.id} (role) needs >=1 allowed route`);
  else check(!a.allowedRoutes || a.allowedRoutes.length === 0, `action ${a.id} (runtime) must not declare allowedRoutes`);
  for (const routeId of a.allowedRoutes || []) {
    check(routeIds.includes(routeId), `action ${a.id} route ${routeId} unknown`);
  }
  if (a.responsibleAuthority.kind === 'role') check(roleIds.includes(a.responsibleAuthority.role), `action ${a.id} role unknown`);
  else check(has(val.validators, a.responsibleAuthority.validator), `action ${a.id} runtime validator unknown`);
  // execution
  if (a.execution.mode === 'parallel') {
    check(Array.isArray(a.execution.branches) && a.execution.branches.length >= 2, `action ${a.id} parallel needs branches`);
    for (const b of a.execution.branches) check(a.allowedRoutes.includes(b.route), `action ${a.id} branch route ${b.route} not in allowedRoutes`);
    check(a.execution.join && a.execution.join.barrier === true, `action ${a.id} parallel join must have barrier`);
    if (a.execution.join.mode === 'aggregator') check(actionIds.includes(a.execution.join.aggregatorAction), `action ${a.id} aggregator action unknown`);
  }
  if (a.selector.kind === 'planner') { check(actionIds.includes(a.selector.action), `planner action unknown`); check(a.selector.nonRecursive === true, 'planner must be nonRecursive'); }
  // allowedSuccessors == graph out-edges of this action's node(s)
  const nodesOf = wf.graph.nodes.filter(n => n.action === a.id);
  for (const n of nodesOf) {
    const expected = [...(outEdges[n.id] || [])].sort();
    const declared = (a.allowedSuccessors || []).sort();
    check(JSON.stringify(expected) === JSON.stringify(declared), `action ${a.id}: allowedSuccessors ${JSON.stringify(declared)} != graph out-edges ${JSON.stringify(expected)}`);
  }
  if (a.budget) check(budgetIds.includes(a.budget), `action ${a.id} budget ${a.budget} unknown`);
  if (a.waitPolicy) check(waitIds.includes(a.waitPolicy.wait), `action ${a.id} wait ${a.waitPolicy.wait} unknown`);
  if (a.recovery) check(recIds.includes(a.recovery), `action ${a.id} recovery ${a.recovery} unknown`);
  if (a.escalation) check(a.escalation.scope === 'route-within-allowed', `action ${a.id} escalation scope invalid`);
  check(a.gate.freeTextBypass === 'prohibited', `action ${a.id} gate must prohibit free-text bypass`);
  for (const v of a.gate.deterministic || []) check(has(val.validators, v), `action ${a.id} gate validator ${v} unknown`);
}

// 6. Routes
const boundInstructionIds = new Set();
for (const r of routes.routes) {
  check(roleIds.includes(r.role), `route ${r.id} role unknown`);
  check(r.agent.managedProjection === 'required', `route ${r.id} managedProjection required`);
  const refs = [r.agent.definition, r.resources.rolePrompt, r.resources.model, r.resources.driver, ...r.resources.skills, ...r.resources.tools, ...r.resources.actionPrompts.map(p => p.prompt)];
  for (const ref of refs) check(resIndex[ref.id], `route ${r.id} resource ref ${ref.id} undeclared`);
  checkResourceKind(r.id, 'agent.definition', r.agent.definition, 'agent-definition');
  checkResourceKind(r.id, 'rolePrompt', r.resources.rolePrompt, 'role-prompt');
  boundInstructionIds.add(r.resources.rolePrompt.id);
  checkResourceKind(r.id, 'model', r.resources.model, 'model');
  checkResourceKind(r.id, 'driver', r.resources.driver, 'driver');
  for (const skill of r.resources.skills) {
    checkResourceKind(r.id, 'skill', skill, 'skill');
    boundInstructionIds.add(skill.id);
  }
  for (const tool of r.resources.tools) checkResourceKind(r.id, 'tool', tool, 'tool');
  for (const ap of r.resources.actionPrompts) {
    check(actionIds.includes(ap.action), `route ${r.id} actionPrompt action ${ap.action} unknown`);
    checkResourceKind(r.id, 'actionPrompt', ap.prompt, 'action-prompt');
    boundInstructionIds.add(ap.prompt.id);
    const action = acts.actions.find(candidate => candidate.id === ap.action);
    if (action) {
      check(
        (action.allowedRoutes || []).includes(r.id),
        `route ${r.id} binds action prompt for ${ap.action} but that action does not allow this route`
      );
    }
  }
}
for (const resource of Object.values(resIndex)) {
  if (['role-prompt', 'action-prompt', 'skill'].includes(resource.kind)) {
    check(
      boundInstructionIds.has(resource.id),
      `instruction resource ${resource.id} (${resource.kind}) is not bound through any route`
    );
  }
}

// 7. Artifacts
const artIds = arts.artifacts.map(a => a.id);
for (const a of arts.artifacts) {
  if (a.template.reference) check(resIndex[a.template.reference.id], `artifact ${a.id} template ref undeclared`);
  else check(typeof a.template.content === 'string' && a.template.content.length > 0, `artifact ${a.id} template must have content or reference`);
  check(actionIds.includes(a.producedBy), `artifact ${a.id} producedBy unknown`);
  for (const c of a.consumedBy || []) check(actionIds.includes(c), `artifact ${a.id} consumedBy ${c} unknown`);
}

// 8. Validation
for (const agg of val.aggregation) check(actionIds.includes(agg.scope), `aggregation ${agg.id} scope unknown`);
for (const rv of val.review) { check(roleIds.includes(rv.role), `review ${rv.id} role unknown`); check(rv.isolation === 'session-isolated' && rv.barrier === true, `review ${rv.id} must be isolated with barrier`); check(artIds.includes(rv.admission.findingShape), `review ${rv.id} findingShape unknown`); }
for (const c of val.conformance) check(['positive', 'negative', 'recovery'].includes(c.class), `conformance ${c.id} class invalid`);

// 9. Closed predicate vocab + forbidden physical fields scan
const OPS = ['eq','ne','gt','gte','lt','lte','exists','notExists','in','notIn','contains','notContains'];
const scan = (obj) => {
  if (obj && typeof obj === 'object') {
    if (obj.op && typeof obj.op === 'string') check(OPS.includes(obj.op), `unknown predicate op: ${obj.op}`);
    for (const v of Object.values(obj)) scan(v);
  } else if (typeof obj === 'string') {
    const s = obj.toLowerCase();
    for (const tok of ['stategraph','langgraph.json','langgraph','checkpoint_id','thread_id','memorysaver','sqlitesaver','add_messages','last_value','annotations.root','send api','interrupt(', 'codex ','copilot ']) {
      if (s.includes(tok)) errors.push(`forbidden physical field/API token in Definition: '${tok}' near: ${obj.slice(0, 80)}`);
    }
  }
};
scan(pkg); scan(wf); scan(acts); scan(roles); scan(routes); scan(arts); scan(val);

if (errors.length) { console.error('FAIL ' + errors.length + ' checks:'); errors.forEach(e => console.error('  - ' + e)); process.exit(1); }
console.log('PASS: all closure checks succeeded for examples/minimal');
