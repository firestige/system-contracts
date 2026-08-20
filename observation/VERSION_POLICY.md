# Observation Contract version policy

The current first-release candidate is Observation Contract/Profile `1.0.0`. It preserves the closed semantics reviewed as candidate `0.3.0`; the version change is the lifecycle-required first frozen-version boundary, not a semantic extension.

Observation Contract/Profile `0.3.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

The `delivery-manifest-0.1.0`, `delivery-lifecycle-result-0.1.0`, `fixture-case-0.1.0`, and `publication-record-0.1.0` identifiers are versions of their individual envelope formats, not alternate Observation Contract revisions. Their records bind to Profile `1.0.0` where applicable.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional surface additions.
- MAJOR: fact meaning, field removal, closed-vocabulary, carrier, identity, admission, retry, or compatibility changes; it restarts the full Contract lifecycle.
- Compatibility is explicit against exact Contract/Profile and family coordinates; matching names never widens it.
- The official carrier is OTLP/protobuf. JSON schemas in this package are decoded conformance forms, never an alternate wire.

Until contract.gate.1–contract.gate.6 and owner approval pass, `1.0.0` remains `REVIEW_CANDIDATE`, is not published, and admits no conformance claim.
