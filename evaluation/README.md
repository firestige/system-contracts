# Evaluation Metric Catalog — machine representation

[English](README.md) | [中文](README.zh-CN.md)

This directory contains the candidate machine representation of the 15-metric MVP Evaluation Catalog. The semantic authority remains the parent repository's [`Metric Catalog`](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evaluation/metric-catalog.md); this representation encodes that document and cannot silently redefine it.

| Content | Path | Role |
| --- | --- | --- |
| JSON Schema | [`schemas/metric-catalog-1.0.0.schema.json`](schemas/metric-catalog-1.0.0.schema.json) | draft-07 structural contract for the catalog, semantic-input registry and metric records |
| Normative example | [`examples/metric-catalog-1.0.0.json`](examples/metric-catalog-1.0.0.json) | exact 15-metric MVP candidate instance |
| Validator | [`tools/check-catalog.cjs`](tools/check-catalog.cjs) | strict schema validation plus catalog-wide identity, metric-set and input-reference closure checks |
| Contract tests | [`tools/test-metric-catalog.cjs`](tools/test-metric-catalog.cjs) | positive example and fail-closed duplicate/missing/unresolved/zero/unexpected-set mutations |
| Fixture manifest | [`fixtures/cases-1.0.0.json`](fixtures/cases-1.0.0.json) | one conforming case plus nine executable fail-closed JSON-Patch-style mutations |
| Version policy | [`VERSION_POLICY.md`](VERSION_POLICY.md) | exact first-release and compatibility boundary |
| Publication record | [`publication/publication-record-1.0.0.json`](publication/publication-record-1.0.0.json) | unpublished candidate inventory and gate state |

## Encoded constraints

- Every metric has its exact versioned `input_refs`; every reference resolves to the catalog's closed `input_definitions` registry, and the checker rejects missing, additional or reassigned inputs.
- `input_definitions` distinguish `observation`, `evaluation` and `projection` ownership. Their binding is always `human-semantic-reference`: an input reference is not an OTel wire-field binding and grants no producer, provider or DSH authority.
- The checker requires exactly the 15 metric IDs declared by `evaluation.definition`, rejects duplicate metric and input IDs, and rejects missing or unexpected metrics.
- `value_semantics.missing` must match `N/A when …`; a missing value cannot be encoded as numeric or textual zero.
- The example marks all metrics `planned`. Schema validity and `REVIEW_CANDIDATE` status prove neither implementation nor physical conformance.
- The example pins human `question_refs` to candidate reference version `1.0.0`. No separate Question Catalog is published by this directory; the validator checks their shape, while their semantics remain human evaluation references.

## Validation

```bash
npm ci
npm test
npm run check:example
npm run build:publication
```

Tests create isolated invalid mutations from the normative example and verify that each fails for its intended reason. This directory remains a Contract candidate until the repository's publication gates and owner approval are complete.
