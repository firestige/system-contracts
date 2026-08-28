const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Ajv = require("ajv/dist/2020");

const root = path.join(__dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const schema = read("schemas/task-binding-0.1.0.schema.json");
const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);

test("accepts default/new and exact reuse choices", () => {
  for (const fixture of ["default-new.json", "named-new.json", "exact-reuse.json"]) {
    const value = read(`fixtures/positive/${fixture}`);
    assert.equal(validate(value), true, `${fixture}: ${JSON.stringify(validate.errors)}`);
  }
});

test("rejects ambiguous identity and metadata choices", () => {
  for (const fixture of ["new-with-id.json", "reuse-with-name.json", "invalid-id.json"])
    assert.equal(validate(read(`fixtures/negative/${fixture}`)), false, fixture);
});

test("display name never participates in Task identity", () => {
  assert.deepEqual(schema.$defs.taskIdentity.required, ["taskId"]);
  assert.equal(schema.$defs.taskIdentity.properties.displayName, undefined);
  assert.deepEqual(schema.$defs.resolvedBinding.required, ["schemaVersion", "taskId"]);
  assert.equal(schema.$defs.resolvedBinding.properties.taskDisplayName !== undefined, true);
});
