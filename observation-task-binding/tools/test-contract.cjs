const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const candidate = JSON.parse(fs.readFileSync(
  path.join(root, "observation-profile-2.0.0.task-binding.json"),
  "utf8",
));

test("Task binding is a new candidate and leaves Profile 1.0.0 immutable", () => {
  const published = JSON.parse(fs.readFileSync(
    path.join(root, "..", "observation", "registries", "observation-profile-1.0.0.json"),
    "utf8",
  ));
  assert.equal(published.profile_version, "1.0.0");
  assert.equal(published.event_names.includes("task.binding"), false);
  assert.equal(candidate.coordinate, "agentops.observation-profile@2.0.0");
  assert.equal(candidate.status, "REVIEW_CANDIDATE");
  assert.equal(candidate.extends_exact, "agentops.observation-profile@1.0.0");
});

test("Task binding carries exact identity and optional non-identity display metadata", () => {
  assert.deepEqual(candidate.event.required_fields, ["C01", "C02", "C07", "C09", "C59", "C60"]);
  assert.deepEqual(candidate.event.optional_fields, ["C58"]);
  assert.deepEqual(candidate.identity.task, ["C02"]);
  assert.deepEqual(candidate.identity.membership, ["C02", "C01"]);
  assert.equal(candidate.identity.non_identity.includes("C58"), true);
  assert.equal(candidate.inherited_field_constraints.C02.maximum_characters, 128);
  assert.equal(
    candidate.inherited_field_constraints.C02.pattern,
    "^[A-Za-z0-9][A-Za-z0-9._:/@-]*$",
  );
  assert.deepEqual(candidate.field_additions.C58, {
    name: "agentops.task.display_name",
    type: "string",
    max_chars: 160,
    requiredness: "optional",
  });
});

test("Task binding carries one bounded canonical Manifest projection", () => {
  assert.deepEqual(candidate.field_additions.C59, {
    name: "agentops.delivery.manifest_projection",
    type: "canonical_json_string",
    max_utf8_bytes: 65536,
    requiredness: "required",
  });
  assert.deepEqual(candidate.field_additions.C60, {
    name: "agentops.delivery.manifest_projection_digest",
    type: "lowercase_sha256_hex",
    requiredness: "required",
  });
  assert.equal(candidate.manifest_projection.schema_version, "execution.delivery-manifest-projection@1.0.0");
  assert.equal(candidate.manifest_projection.maximum_roles, 128);
  assert.deepEqual(candidate.manifest_projection.identity_equalities, {
    delivery_id: "C01",
    task_id: "C02",
    manifest_digest: "C07",
  });
  assert.deepEqual(candidate.manifest_projection.role_fields, [
    "role_id",
    "role_prompt_identity",
    "role_prompt_digest",
    "agent_provider_id",
    "model_provider_id",
    "model_id",
    "resolution_source",
  ]);
});

test("Task binding identity is deterministic from Delivery identity", () => {
  assert.deepEqual(candidate.identity.C09_derivation, {
    prefix: "task-binding-",
    input: "UTF8(C01)",
    digest: "SHA256_LOWERCASE_HEX",
    digest_prefix_characters: 24,
  });
});

test("Task binding is emitted at durable admission and remains non-controlling", () => {
  assert.equal(candidate.event.owner, "M01");
  assert.equal(candidate.event.phase, "DELIVERY_BOUND");
  assert.equal(candidate.event.emission_boundary, "AFTER_MANIFEST_AND_SLOT_PERSIST_BEFORE_RUNNER_LAUNCH");
  assert.equal(candidate.event.delivery_outcome_control, "NONE");
  assert.deepEqual(candidate.projections, [
    "TASK_DECLARATION",
    "DELIVERY_TASK_MEMBERSHIP",
    "DELIVERY_TASK_GUARD",
    "TASK_DISPLAY_NAME_IF_PRESENT",
    "DELIVERY_MANIFEST",
  ]);
});

test("Delivery uniqueness and display merge are deterministic without arrival order", () => {
  assert.deepEqual(candidate.identity.delivery_guard, {
    key: ["C01"],
    value: ["C02", "C07"],
    mismatch: "CONFLICT",
  });
  assert.deepEqual(candidate.display_merge, {
    absent: "NEUTRAL",
    one_distinct_nonempty: "AVAILABLE",
    multiple_distinct_nonempty: "CONFLICT",
    order: "BYTEWISE_DISTINCT_SET",
  });
});
