# Workflow DSL version policy

The current first frozen release is `agentops.workflow-dsl@1.0.0`. It incorporates the graph, authority, parallel/join, continuation/event, Package Snapshot, and conformance-corpus decisions recorded by the Contract owner for issue #77. It is a new publication, not a claim that the withdrawn `0.1.0` candidate was semantically identical.

`agentops.workflow-dsl@0.1.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional surface additions.
- MAJOR: field removal, closed-vocabulary change, graph/merge/authority semantic change, or other incompatible behavior; it restarts the full Contract lifecycle.
- A Package and all six companion documents use one exact `schemaVersion`; compatibility ranges are explicit and never widened by inference.
- A Delivery remains bound to the exact Contract, Package, Definition, and Snapshot revisions selected before its Manifest is created.

Contract.gate.1–contract.gate.6 and explicit owner approval passed for the exact `1.0.0` candidate. The revision is `FROZEN` and published with a `DEFINITION_AND_VALIDATOR_ONLY` conformance claim; no production Runtime conformance is claimed.
