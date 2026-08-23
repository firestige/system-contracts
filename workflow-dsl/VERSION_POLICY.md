# Workflow DSL version policy

The current frozen release is `agentops.workflow-dsl@1.1.0`. It preserves the `1.0.0` graph and authority model and adds the R6 author-intent surface for typed dataflow, parallel selection, Host operations, control ports, session scope, and Action capabilities.

`agentops.workflow-dsl@0.1.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional surface additions.
- MAJOR: field removal, closed-vocabulary change, graph/merge/authority semantic change, or other incompatible behavior; it restarts the full Contract lifecycle.
- A Package and all six companion documents use one exact `schemaVersion`; compatibility ranges are explicit and never widened by inference.
- A Delivery remains bound to the exact Contract, Package, Definition, and Snapshot revisions selected before its Manifest is created.

`agentops.workflow-dsl@1.0.0` remains a resolving historical frozen release for Deliveries already bound to it. Contract.gate.1–contract.gate.6 and explicit R6 owner approval apply to the exact `1.1.0` publication. Its conformance claim remains `DEFINITION_AND_VALIDATOR_ONLY`; no production Runtime conformance is claimed.
