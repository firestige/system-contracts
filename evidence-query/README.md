# Evidence Query Contract candidate 0.1.0

English | [中文](README.zh-CN.md)

This directory is the machine-readable `evidence.query@0.1.0` review candidate. It is bound to Wave6 input manifest SHA-256 `e605720c5b225fa9228e2a4b1a8001f3235482ed83dc214e4c766e5caa6e1706`, Observation Profile `1.0.0`, and read-model revision `1.0.0`.

Its status is `REVIEW_CANDIDATE` and its claim is `VALIDATOR_ONLY`. It is not published or frozen. Passing a JSON schema alone is never a conformance claim; semantic validation, fixture outcomes, implementation behavior, lifecycle gates, and owner publication are still required.

## Surface

- `registries/evidence-query-0.1.0.json` closes routes, enums, projection ownership, compatibility dimensions, expiry owners, policy defaults, and all exact source digests.
- `schemas/evidence-query-response-0.1.0.schema.json` closes Fact, Trace, envelope, truth, relationship, and error JSON shapes.
- `schemas/evidence-query-internal-1.0.0.schema.json` closes `SnapshotPage`, trace summaries, `ExpiryOwner`, `ExpiryRecord`, `ExpiryBatch`, and `ExpiryResult` values.
- `tools/validator.cjs` enforces cross-field semantics that JSON Schema cannot express: projection tuples, relationship endpoints, expiry compatibility order, trace aggregation, request/error classification, exact LINK identity behavior, batch selection, and canonical digest bytes.
- `fixtures/{positive,negative,recovery}` and `examples/` are the executable candidate corpus.
- `publication/publication-candidate-0.1.0.json` inventories exact artifact bytes; it deliberately records `published=false`.

## Validation

```sh
npm ci
npm test
npm run check
npm run build:publication
npm test
```

`build:publication` is deterministic for unchanged package bytes. Run it after any artifact change, then run the tests because the inventory itself is checked.

The validator consumes the exact published Observation registry/schema/validator coordinates named in the Wave6 manifest. It does not expose Raw data, SQL/storage shapes, projection-effect names, credentials, or a write interface.
