# Workflow DSL version policy

The current first-release candidate is `agentops.workflow-dsl@1.0.0`. It preserves the closed semantics reviewed as candidate `0.1.0`; the version change is the lifecycle-required first frozen-version boundary, not a semantic extension.

`agentops.workflow-dsl@0.1.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional surface additions.
- MAJOR: field removal, closed-vocabulary change, graph/merge/authority semantic change, or other incompatible behavior; it restarts the full Contract lifecycle.
- A Package and all six companion documents use one exact `schemaVersion`; compatibility ranges are explicit and never widened by inference.
- A Delivery remains bound to the exact Contract, Package, Definition, and Snapshot revisions selected before its Manifest is created.

Until contract.gate.1–contract.gate.6 and owner approval pass, `1.0.0` remains `REVIEW_CANDIDATE`, is not published, and admits no conformance claim.
