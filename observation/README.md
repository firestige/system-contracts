# Observation contract candidate 1.0.0

English | [中文](README.zh-CN.md)

This directory is the machine-readable candidate for issue #42. It encodes, but does not replace, the semantic authority in the parent repository's Observation Catalog, OTel Observation Profile, and Execution–Evidence Interaction Contract. When prose and this package differ, the current product decision and those source documents govern until the candidate is corrected.

The package is **not published** and makes **no production conformance claim**. The normalized JSON record schema is a decoded test representation only. The wire carrier remains OTLP binary protobuf: `ExportTraceServiceRequest` for Spans and `ExportLogsServiceRequest` for Events.

## Contract surface

- `registries/observation-profile-1.0.0.json` fixes the OTel `1.56.0`, OTLP/protobuf `1.10.0`, semantic-conventions `1.41.1`, Scope/schema pins, ten EventNames, and the closed 57 common + 10 Implementation + 6 System Design fields.
- `schemas/` defines strict Delivery Manifest, lifecycle-result, decoded-record, family, fixture-case, and publication-record shapes.
- `fixtures/` covers positive and negative admission, base endpoints, multi-target Findings, duplicate/conflict, partial success, sampling, privacy, lineage, crash recovery, completeness, native usage, and retention-boundary behavior.
- `tools/validator.cjs` is the shared semantic oracle. `tools/check-corpus.cjs` exposes producer and acceptor roles against the same corpus.
- `publication/publication-record-1.0.0.json` records candidate verification. Its status remains `REVIEW_CANDIDATE`, `published=false`, and `conformance_claim=NONE`.

## Fixed physical decisions

Identifiers use printable ASCII `[A-Za-z0-9._:/@-]`, start alphanumerically, and contain at most 128 characters. Finding summaries contain 1–512 characters and are rejected, never truncated, when over limit. Digests use SHA-256 lowercase hex over RFC 8785 JSON Canonicalization Scheme bytes for logical JSON objects; byte artifacts use SHA-256 over their exact bytes.

One admission batch contains at most 512 records and 4 MiB of exact OTLP protobuf request bytes. The decoded-record validator accepts that byte count from the carrier adapter; it never substitutes JSON fixture size. Pagination defaults to 100 and permits at most 500 records. Within one admitted batch, bounded-cardinality fields permit at most 256 distinct values and high-cardinality fields at most 512; low-cardinality fields are closed enums. The default head-sampling probability is `1`. Per-record dispositions are Admission-internal; transport responses expose only the pinned OTLP aggregate partial-success form.

These are interchange/admission limits. Evidence storage schemas and migrations, production emitter/acceptor code, long-horizon capacity and cardinality tuning, latency, backpressure, security, retention duration, and operational SLOs remain owned by their downstream implementation issues. This package does not move those responsibilities into the Contract.

## Validation

```sh
npm install
npm test
npm run check -- --role producer
npm run check -- --role acceptor
```

Both roles deliberately run one closed oracle. A production implementation may claim conformance only after independently emitting or accepting the corpus through the same role interface and supplying the publication evidence required by the contract lifecycle. Passing this reference validator alone is not cross-implementation conformance.

Version `1.0.0` is the current first-iteration candidate. Breaking registry, shape, carrier, identity, or truth changes require a new profile version; additive fixture or validator corrections that preserve accepted meaning may revise the candidate before publication. No compatibility promise exists until physical publication.
