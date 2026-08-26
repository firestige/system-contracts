# Evidence Query Contract 0.1.0

English | [中文](README.zh-CN.md)

This directory is the frozen machine-readable representation of `evidence.query@0.1.0`. It is bound to Wave6 input manifest SHA-256 `e605720c5b225fa9228e2a4b1a8001f3235482ed83dc214e4c766e5caa6e1706`, Observation Profile `1.0.0`, read-model revision `1.0.0`, and the exact semantic publication record.

Its status is `FROZEN` and its maximum claim is `VALIDATOR_ONLY`. Passing a JSON schema alone is never a production or cross-implementation conformance claim; implementations must still prove their own physical behavior against this exact revision.

## Surface

- `registries/evidence-query-0.1.0.json` closes routes, enums, projection ownership, compatibility dimensions, expiry owners, policy defaults, and all exact source digests.
- `schemas/evidence-query-response-0.1.0.schema.json` closes Fact, Trace, envelope, truth, relationship, and error JSON shapes.
- `schemas/evidence-query-internal-1.0.0.schema.json` closes `SnapshotPage`, trace summaries, `ExpiryOwner`, `ExpiryRecord`, `ExpiryBatch`, and `ExpiryResult` values.
- `tools/validator.cjs` enforces cross-field semantics that JSON Schema cannot express: projection tuples, relationship endpoints, expiry compatibility order, trace aggregation, request/error classification, exact LINK identity behavior, batch selection, and canonical digest bytes.
- `fixtures/{positive,negative,recovery}` and `examples/` are the executable candidate corpus.
- `publication/publication-candidate-0.1.0.json` is the immutable qualified RC input and remains `published=false` historical evidence.
- `publication/publication-record-0.1.0.json` binds the frozen semantic companions, qualified RC, final machine inventory, all six gates, and owner approval.

## Validation

```sh
npm ci
npm test
npm run check
npm run build:publication
npm test
```

`build:publication` deterministically regenerates the frozen publication record for unchanged package bytes. The qualified candidate record is never regenerated or overwritten.

The validator consumes the exact published Observation registry/schema/validator coordinates named in the Wave6 manifest. It does not expose Raw data, SQL/storage shapes, projection-effect names, credentials, or a write interface.
