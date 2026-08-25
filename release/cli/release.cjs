const { createHash } = require("node:crypto");
const { cp, mkdir, readFile, readdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const CONFIG_KEYS = [
  "schemaVersion", "repository", "releaseBranch", "triggerBranch", "assetMode",
  "acceptanceCommand", "buildCommand", "verifyCommand", "publisherAdapter",
  "remoteInstallMode", "stablePolicy", "capabilities",
];

class ReleaseError extends Error {}

function assertConfiguration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...CONFIG_KEYS].sort().join(",")
    || value.schemaVersion !== "wsr.release-component@1.0.0"
    || value.releaseBranch !== "main" || !/^release\/[a-z0-9._-]+$/.test(value.triggerBranch)
    || value.stablePolicy !== "qualified-candidate-exact-assets"
    || !Array.isArray(value.capabilities) || value.capabilities.length === 0
    || new Set(value.capabilities).size !== value.capabilities.length) {
    throw new ReleaseError("RELEASE_CONFIGURATION_INVALID");
  }
}

function simulateLifecycle(scenario) {
  if (["happy", "candidate-main-divergence"].includes(scenario)) return "STABLE";
  if (scenario === "npm-partial-failure") return "UNSUPPORTED_SCENARIO";
  const failures = {
    "digest-mismatch": "RELEASE_ARTIFACT_DIGEST_MISMATCH",
    "tag-collision": "RELEASE_TAG_COLLISION",
    "permission-denied": "RELEASE_PERMISSION_DENIED",
    "builtin-token-final-publish": "RELEASE_APP_TOKEN_REQUIRED",
  };
  if (failures[scenario]) throw new ReleaseError(failures[scenario]);
  throw new ReleaseError("RELEASE_SCENARIO_UNKNOWN");
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function publicationFiles(repository) {
  const entries = await readdir(repository, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.parentPath.includes(`${path.sep}publication`)
      && entry.name.endsWith(".json"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

async function buildPublicationBundle(repository, destination, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new ReleaseError("RELEASE_REVISION_INVALID");
  await mkdir(destination, { recursive: true });
  const artifacts = [];
  for (const source of await publicationFiles(repository)) {
    const relative = path.relative(repository, source);
    const name = relative.split(path.sep).join("--");
    const target = path.join(destination, name);
    await cp(source, target);
    const bytes = await readFile(target);
    artifacts.push({ name, bytes: bytes.byteLength, sha256: sha256(bytes), source: relative });
  }
  if (artifacts.length === 0) throw new ReleaseError("RELEASE_ARTIFACT_SET_INVALID");
  const manifest = {
    schemaVersion: "wsr.contract-publication-release@1.0.0",
    revision,
    artifacts,
  };
  await writeFile(path.join(destination, "release-metadata.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { artifactCount: await verifyPublicationBundle(destination) };
}

async function verifyPublicationBundle(destination) {
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(destination, "release-metadata.json"))); }
  catch (error) { throw new ReleaseError("RELEASE_METADATA_INVALID", { cause: error }); }
  if (manifest.schemaVersion !== "wsr.contract-publication-release@1.0.0"
    || !/^[a-f0-9]{40}$/.test(manifest.revision) || !Array.isArray(manifest.artifacts)
    || manifest.artifacts.length === 0) throw new ReleaseError("RELEASE_METADATA_INVALID");
  for (const artifact of manifest.artifacts) {
    let bytes;
    try { bytes = await readFile(path.join(destination, artifact.name)); }
    catch (error) { throw new ReleaseError("RELEASE_ARTIFACT_SET_INVALID", { cause: error }); }
    if (artifact.bytes !== bytes.byteLength || artifact.sha256 !== sha256(bytes)) {
      throw new ReleaseError("RELEASE_ARTIFACT_DIGEST_MISMATCH");
    }
  }
  return manifest.artifacts.length;
}

async function run(args = process.argv.slice(2)) {
  const [command, value, revision] = args;
  const repository = path.resolve(__dirname, "../..");
  if (command === "config") {
    const config = JSON.parse(await readFile(path.join(repository, "release/config/component.json")));
    assertConfiguration(config);
    return { repository: config.repository, status: "PASS" };
  }
  if (command === "simulate" && value) return { scenario: value, state: simulateLifecycle(value) };
  if (command === "build" && value && revision) {
    return { ...(await buildPublicationBundle(repository, path.resolve(value), revision)), status: "PASS" };
  }
  if (command === "verify" && value) {
    return { artifactCount: await verifyPublicationBundle(path.resolve(value)), status: "PASS" };
  }
  throw new ReleaseError("RELEASE_CLI_USAGE_INVALID");
}

module.exports = {
  ReleaseError,
  assertConfiguration,
  buildPublicationBundle,
  simulateLifecycle,
  verifyPublicationBundle,
};

if (require.main === module) {
  run().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`));
}
