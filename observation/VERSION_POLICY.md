# Observation Contract version policy

The current frozen Contract release is `observation-contract@1.0.2`. It is a non-semantic PATCH that refreshes the exact semantic binding after release-coordinate documentation changed. It preserves the `1.0.1` validator behavior and wire Profile `1.0.0`; it adds no fact meaning or wire coordinate. The `1.0.0` and `1.0.1` publication records remain byte-identical and resolving for exact historical consumers.

Observation Contract/Profile `0.3.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

The `delivery-manifest-0.1.0`, `delivery-lifecycle-result-0.1.0`, `fixture-case-0.1.0`, and `publication-record-0.1.x` identifiers are versions of their individual envelope formats, not alternate Observation Contract revisions. Their records bind to Profile `1.0.0` where applicable.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional surface additions.
- MAJOR: fact meaning, field removal, closed-vocabulary, carrier, identity, admission, retry, or compatibility changes; it restarts the full Contract lifecycle.
- Compatibility is explicit against exact Contract/Profile and family coordinates; matching names never widens it.
- The official carrier is OTLP/protobuf. JSON schemas in this package are decoded conformance forms, never an alternate wire.

Contract.gate.1–contract.gate.6 and owner approval passed for `1.0.0`; its exact publication remains immutable. The scoped PATCH gates and owner approval recorded in `publication/publication-record-1.0.1.json` publish the validator correction, and `publication/publication-record-1.0.2.json` publishes the refreshed exact binding. Both retain the same `VALIDATOR_ONLY` boundary; production and cross-implementation conformance remain unproven.

Release `1.0.1` publishes the 2026-08-24 `W5-BLOCKER-001` correction: the decoded validator bound for the already adopted OTLP `fixed32` Span/Link flags carrier changes from the low 8-bit Trace Flags mask to the full unsigned 32-bit reader range. It adds no EventName, attribute, identity, or alternate carrier and preserves wire Profile `1.0.0`; official serializers still create new Spans with reserved bits 10–31 zero. The correction was previously written into the `1.0.0` publication record in place; `1.0.1` repairs that lifecycle defect by restoring the original record and publishing new exact bytes.

Release `1.0.2` makes no validator or semantic change. It closes the exact-binding drift caused when `docs/systems/execution/project-execution-system.md` was updated to the published npm coordinates. The new release publishes fresh exact semantic and machine inventories; it does not rewrite either historical publication.
