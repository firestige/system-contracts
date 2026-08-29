const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), "utf8"));
const factorySchema = read("schemas", "agent-provider-factory.schema.json");
const repositorySchema = read("schemas", "repository-role-provider-bindings.schema.json");
const resolvedSchema = read("schemas", "resolved-role-provider-bindings.schema.json");
const positive = read("fixtures", "positive", "mixed-providers.json");
const negative = read("fixtures", "negative", "fail-closed.json");

test("factory, repository, and resolved contracts are closed and versioned", () => {
  assert.equal(factorySchema.additionalProperties, false);
  assert.equal(repositorySchema.additionalProperties, false);
  assert.equal(repositorySchema.properties.bindings.maxProperties, 1024);
  assert.equal(repositorySchema.$defs.binding.additionalProperties, false);
  assert.equal(resolvedSchema.additionalProperties, false);
  assert.equal(resolvedSchema.properties.resolvedRoles.maxItems, 128);
  assert.equal(resolvedSchema.$defs.resolvedRole.additionalProperties, false);
  assert.equal(resolvedSchema.$defs.resolvedRole.properties.resolutionSource.const, "REPOSITORY");
});

test("positive corpus binds different Roles to different exact Providers", () => {
  assert.equal(positive.decision, "ACCEPT");
  assert.equal(new Set(positive.factories.map((entry) => entry.identity)).size, 2);
  const facilitator = positive.repository.bindings["role.facilitator"];
  const reviewer = positive.repository.bindings["role.reviewer"];
  assert.notEqual(facilitator.agentProvider.identity, reviewer.agentProvider.identity);
  for (const [role, binding] of Object.entries(positive.repository.bindings)) {
    const factory = positive.factories.find((entry) => entry.identity === binding.agentProvider.identity);
    assert.ok(factory);
    assert.equal(factory.version, binding.agentProvider.version);
    for (const capability of positive.requiredCapabilities[role]) assert.ok(factory.capabilities.includes(capability));
  }
});

test("negative corpus closes missing, mismatch, recovery, and fallback branches", () => {
  assert.deepEqual(negative.cases.map((entry) => entry.caseId), [
    "missing-role-binding",
    "unknown-provider",
    "version-mismatch",
    "capability-mismatch",
    "recovery-descriptor-mismatch",
    "fallback-field",
  ]);
  assert.equal(negative.cases.every((entry) => entry.decision.startsWith("REJECT")), true);
});

test("schemas contain no credential, endpoint, priority, default, or fallback authority", () => {
  const bytes = JSON.stringify({ factorySchema, repositorySchema, resolvedSchema }).toLowerCase();
  for (const prohibited of ["credential", "endpoint", "priority", "defaultprovider", "fallbackprovider"]) {
    assert.equal(bytes.includes(prohibited), false);
  }
});
