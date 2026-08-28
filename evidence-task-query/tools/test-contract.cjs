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
  assert.equal(candidate.supersedes, "evidence.query@0.1.0");
  assert.equal(candidate.route.path, "/v1/evidence/tasks");
});

test("atomically projects identity, membership, guard, and optional display metadata", () => {
  assert.deepEqual(candidate.projection.transaction, [
    "TASK_DECLARATION",
    "DELIVERY_TASK_MEMBERSHIP",
    "DELIVERY_TASK_GUARD",
    "TASK_DISPLAY_NAME_IF_PRESENT",
    "DELIVERY_MANIFEST",
  ]);
  assert.deepEqual(candidate.projection.TASK_DECLARATION, { key: ["task_id"], payload: {} });
  assert.deepEqual(candidate.projection.DELIVERY_TASK_MEMBERSHIP.key, ["task_id", "delivery_id"]);
  assert.deepEqual(candidate.projection.DELIVERY_TASK_GUARD.key, ["delivery_id"]);
  assert.equal(candidate.projection.TASK_DISPLAY_NAME_IF_PRESENT.absent, "NO_EFFECT");
  assert.deepEqual(candidate.projection.DELIVERY_MANIFEST.key, ["manifest_digest"]);
  assert.deepEqual(candidate.projection.DELIVERY_MANIFEST.payload, ["canonical_projection", "projection_digest"]);
  assert.equal(candidate.projection.DELIVERY_MANIFEST.different_canonical_content, "CONFLICT");
});

test("Manifest query is exact, immutable, and non-paginated", () => {
  assert.deepEqual(candidate.manifest_route, {
    method: "GET",
    path: "/v1/evidence/manifests",
    body: "PROHIBITED",
    accept: "application/json",
    required_parameters: ["manifest_digest"],
    manifest_digest: {
      exact_characters: 64,
      pattern: "^[a-f0-9]{64}$",
    },
    unknown_or_repeated_parameter: "INVALID_FILTER",
    pagination: "PROHIBITED",
    fuzzy_or_latest_lookup: "PROHIBITED",
    errors: {
      missing: "NOT_FOUND",
      conflicting_stored_content: "INTEGRITY_ERROR",
    },
  });
  assert.deepEqual(candidate.response.DELIVERY_MANIFEST, [
    "manifest_digest",
    "manifest_projection_digest",
    "projection",
    "provenance",
  ]);
  assert.ok(candidate.retention.queryable_members.includes("DELIVERY_MANIFEST"));
  assert.equal(candidate.snapshot.manifest_route_independent, true);
  assert.deepEqual(candidate.manifest_route.manifest_digest, {
    exact_characters: 64,
    pattern: "^[a-f0-9]{64}$",
  });
  assert.equal(candidate.response.provenance.DELIVERY_MANIFEST, "accepted task.binding that created the exact immutable Manifest projection");
  assert.deepEqual(candidate.manifest_route.errors, {
    missing: "NOT_FOUND",
    conflicting_stored_content: "INTEGRITY_ERROR",
  });
});

test("Manifest digest grammar rejects uppercase, short, and non-hex coordinates", () => {
  const rule = candidate.manifest_route.manifest_digest;
  const accepts = (value) => value.length === rule.exact_characters && new RegExp(rule.pattern).test(value);
  assert.equal(accepts("a".repeat(64)), true);
  assert.equal(accepts("A".repeat(64)), false);
  assert.equal(accepts("a".repeat(63)), false);
  assert.equal(accepts("g".repeat(64)), false);
});

test("Task list and membership use bounded route-local snapshots", () => {
  assert.deepEqual(candidate.route.modes.LIST_TASKS.required, []);
  assert.deepEqual(candidate.route.modes.TASK_MEMBERSHIP.required, ["task_id", "as_of"]);
  assert.equal(candidate.route.limit.maximum, 200);
  assert.equal(candidate.route.task_id.maximum_characters, 128);
  assert.equal(candidate.route.task_id.pattern, "^[A-Za-z0-9][A-Za-z0-9._:/@-]*$");
  assert.equal(candidate.snapshot.scope, "ONE_TASK_ROUTE_TRAVERSAL");
  assert.equal(candidate.snapshot.shared_with_facts_or_traces, false);
  assert.equal(candidate.order.LIST_TASKS, "task_id_BYTEWISE_ASC");
  assert.equal(candidate.order.TASK_MEMBERSHIP, "delivery_id_BYTEWISE_ASC");
  assert.match(candidate.response.provenance.LIST_TASKS, /display_name/);
  assert.match(candidate.response.provenance.TASK_MEMBERSHIP, /exact task_id and delivery_id/);
});

test("retention atomically removes one Delivery from ordinary query", () => {
  assert.equal(candidate.retention.unit, "DELIVERY");
  assert.equal(candidate.retention.default_ttl, "P30D");
  assert.equal(candidate.retention.physical_disposition, "ATOMIC_DELETE_QUERYABLE_DELIVERY_DATASET");
  assert.ok(candidate.retention.queryable_members.includes("FACTS"));
  assert.ok(candidate.retention.queryable_members.includes("TRACE_DETAIL"));
  assert.ok(candidate.retention.queryable_members.includes("DELIVERY_TASK_MEMBERSHIP"));
  assert.equal(candidate.retention.task_list_rule, "AT_LEAST_ONE_ACTIVE_DELIVERY");
  assert.equal(candidate.retention.recoverable, false);
  assert.equal(candidate.retention.retention_partiality, "PROHIBITED");
  assert.equal(candidate.response.ordinary_query_population, "ACTIVE_DELIVERIES_ONLY");
});
