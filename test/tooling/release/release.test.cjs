const assert = require("node:assert/strict");
const { mkdtemp, readFile, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ReleaseError,
  assertConfiguration,
  buildPublicationBundle,
  simulateLifecycle,
  verifyPublicationBundle,
} = require("../../../release/cli/release.cjs");

const root = path.resolve(__dirname, "../../..");

test("contract adapter is publication-only and language-neutral", async () => {
  const config = JSON.parse(await readFile(path.join(root, "release/config/component.json")));
  assert.doesNotThrow(() => assertConfiguration(config));
  assert.equal(config.assetMode, "contract-publication-records");
  assert.equal(config.publisherAdapter, "contract-publication+github-release");
  assert.equal(JSON.stringify(config).includes("npm-pair"), false);
});

test("contract publication bundle copies and verifies exact publication bytes", async () => {
  const destination = await mkdtemp(path.join(tmpdir(), "contract-release-"));
  const result = await buildPublicationBundle(root, destination, "a".repeat(40));
  assert.ok(result.artifactCount >= 1);
  assert.equal(await verifyPublicationBundle(destination), result.artifactCount);
  const manifest = JSON.parse(await readFile(path.join(destination, "release-metadata.json")));
  await writeFile(path.join(destination, manifest.artifacts[0].name), "changed");
  await assert.rejects(() => verifyPublicationBundle(destination), /RELEASE_ARTIFACT_DIGEST_MISMATCH/);
});

test("generic failure scenarios stop before stable", () => {
  assert.equal(simulateLifecycle("happy"), "STABLE");
  assert.equal(simulateLifecycle("candidate-main-divergence"), "STABLE");
  for (const scenario of ["digest-mismatch", "tag-collision", "permission-denied", "builtin-token-final-publish"]) {
    assert.throws(() => simulateLifecycle(scenario), ReleaseError);
  }
  assert.equal(simulateLifecycle("npm-partial-failure"), "UNSUPPORTED_SCENARIO");
});

test("final publish workflow alone receives the App token", async () => {
  const bootstrap = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const candidate = await readFile(path.join(root, ".github/workflows/release-candidate.yml"), "utf8");
  const promote = await readFile(path.join(root, ".github/workflows/release-promote.yml"), "utf8");
  assert.equal(candidate.includes("WSR_RELEASE_APP_PRIVATE_KEY"), false);
  assert.ok(candidate.includes("push:"));
  assert.ok(candidate.includes("release/request.json"));
  assert.ok(candidate.includes("steps.request.outputs.candidate_tag"));
  assert.ok(candidate.includes("steps.candidate.outputs.exists"));
  assert.ok(candidate.includes('gh release download "$CANDIDATE_TAG" --repo "$GITHUB_REPOSITORY" --pattern "$NAME"'));
  assert.equal(candidate.includes("workflow_call:"), false);
  assert.equal(candidate.includes("workflow_dispatch:"), false);
  assert.ok(candidate.includes('test "$GITHUB_REF_NAME" = "release/next"'));
  assert.equal(bootstrap.includes("uses: ./.github/workflows/release-candidate.yml"), false);
  assert.equal(candidate.includes("DISPATCH_CANDIDATE_TAG"), false);
  assert.ok(candidate.includes("repository: firestige/workflow-self-recursive"));
  assert.ok(candidate.includes("ref: ${{ steps.request.outputs.authority_ref }}"));
  assert.ok(candidate.includes("path: system-contracts"));
  assert.ok(candidate.includes("repository: firestige/wsr-workflow-package"));
  assert.ok(candidate.includes("ref: ${{ steps.request.outputs.consumer_ref }}"));
  assert.ok(candidate.includes("path: workflow-package"));
  assert.ok(candidate.includes("npm --prefix system-contracts/workflow-dsl ci"));
  for (const line of candidate.split("\n").filter((value) => value.includes("gh release"))) {
    assert.ok(line.includes('--repo "$GITHUB_REPOSITORY"'), `unscoped release command: ${line}`);
  }
  for (const line of promote.split("\n").filter((value) => value.includes("gh release"))) {
    assert.ok(line.includes('--repo "$GITHUB_REPOSITORY"'), `unscoped promotion release command: ${line}`);
  }
  assert.ok(candidate.includes("git -C system-contracts ls-remote"));
  assert.ok(promote.includes("actions/create-github-app-token@v3"));
  assert.ok(promote.includes("client-id: ${{ vars.WSR_RELEASE_CLIENT_ID }}"));
  assert.equal(promote.includes("app-id:"), false);
  assert.ok(promote.includes("GH_TOKEN: ${{ steps.release-app-token.outputs.token }}"));
  assert.ok(promote.includes("repositories: wsr-contracts"));
  assert.ok(promote.includes("permission-contents: write"));
  assert.ok(promote.includes("permission-workflows: write"));
});
