const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const candidate = JSON.parse(fs.readFileSync(path.join(root, "evidence-task-query-1.0.0.json"), "utf8"));

test("adds a major candidate without changing frozen Evidence Query", () => {
  const published = JSON.parse(fs.readFileSync(
    path.join(root, "..", "evidence-query", "registries", "evidence-query-0.1.0.json"),
    "utf8",
  ));
  assert.equal(published.contract_revision, "0.1.0");
  assert.equal(candidate.coordinate, "evidence.query@1.0.0");
  assert.equal(candidate.status, "REVIEW_CANDIDATE");
  assert.equal(candidate.route.path, "/v1/evidence/tasks");
});

test("atomically projects identity, membership, guard, and optional display metadata", () => {
  assert.deepEqual(candidate.projection.transaction, [
    "TASK_DECLARATION",
    "DELIVERY_TASK_MEMBERSHIP",
    "DELIVERY_TASK_GUARD",
    "TASK_DISPLAY_NAME_IF_PRESENT",
  ]);
  assert.deepEqual(candidate.projection.TASK_DECLARATION, { key: ["task_id"], payload: {} });
  assert.deepEqual(candidate.projection.DELIVERY_TASK_MEMBERSHIP.key, ["task_id", "delivery_id"]);
  assert.deepEqual(candidate.projection.DELIVERY_TASK_GUARD.key, ["delivery_id"]);
  assert.equal(candidate.projection.TASK_DISPLAY_NAME_IF_PRESENT.absent, "NO_EFFECT");
});

test("Task list and membership use bounded route-local snapshots", () => {
  assert.deepEqual(candidate.route.modes.LIST_TASKS.required, []);
  assert.deepEqual(candidate.route.modes.TASK_MEMBERSHIP.required, ["task_id", "as_of"]);
  assert.equal(candidate.route.limit.maximum, 200);
  assert.equal(candidate.snapshot.scope, "ONE_TASK_ROUTE_TRAVERSAL");
  assert.equal(candidate.snapshot.shared_with_facts_or_traces, false);
  assert.equal(candidate.order.LIST_TASKS, "task_id_BYTEWISE_ASC");
  assert.equal(candidate.order.TASK_MEMBERSHIP, "delivery_id_BYTEWISE_ASC");
  assert.match(candidate.response.provenance.LIST_TASKS, /display_name/);
  assert.match(candidate.response.provenance.TASK_MEMBERSHIP, /exact task_id and delivery_id/);
});

test("Task authority survives Fact and Trace retention", () => {
  assert.equal(candidate.retention.TASK_DECLARATION, "NEVER_EXPIRE");
  assert.equal(candidate.retention.DELIVERY_TASK_MEMBERSHIP, "NEVER_EXPIRE");
  assert.equal(candidate.retention.dependent_fact_expiry_changes_membership, false);
});
