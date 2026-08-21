# Observation Contract 1.0.0

English | [中文](README.zh-CN.md)

This directory is the published machine-readable Contract for issue #42. It encodes, but does not replace, the semantic authority in the parent repository's Observation Catalog, OTel Observation Profile, and Execution–Evidence Interaction Contract. When prose and this package differ, those source documents govern and the package must be corrected through Contract evolution.

The package is **published and FROZEN** with a `VALIDATOR_ONLY` claim; it makes **no production or cross-implementation conformance claim**. The normalized JSON record schema is a decoded test representation only. The wire carrier remains OTLP binary protobuf at one loopback base URL: `ExportTraceServiceRequest` at `/v1/traces` for Spans and `ExportLogsServiceRequest` at `/v1/logs` for Events.

## Contract surface

- `registries/observation-profile-1.0.0.json` fixes the pins, ten EventNames, 73 fields, and each field's closed carrier/EventName placement and requiredness; `compatibility-matrix-1.0.0.json` lists exact supported producer/acceptor/profile/family tuples and defaults all others to fail closed.
- `schemas/` defines strict Delivery Manifest, lifecycle-result, decoded-record, interaction, compatibility-matrix, family, fixture-case, and publication-record shapes.
- `fixtures/` additionally includes official Trace/Log protobuf bytes, including a complete Delivery-root plus model-Span Trace, and signal-specific full, mixed, all-rejected, retry, refusal, timeout, tail-loss, and ambiguous-commit interaction cases.
- `tools/validator.cjs` is the shared semantic oracle. `tools/decode-otlp-protobuf.cjs` performs signal-specific official protobuf decoding and closed profile admission; `tools/check-corpus.cjs` exposes producer and acceptor roles against the same corpus.
- `publication/publication-record-1.0.0.json` records the passed gates, owner approval, and separate content-derived revisions for the Super Project semantics and machine package. Its status is `PUBLISHED`, `published=true`, and `conformance_claim=VALIDATOR_ONLY`.

## Fixed physical decisions

Identifiers use printable ASCII `[A-Za-z0-9._:/@-]`, start alphanumerically, and contain at most 128 characters. Finding summaries contain 1–512 characters and are rejected, never truncated, when over limit. Digests use SHA-256 lowercase hex over RFC 8785 JSON Canonicalization Scheme bytes for logical JSON objects; byte artifacts use SHA-256 over their exact bytes.

One admission batch contains at most 512 logical records and 4 MiB of exact OTLP protobuf request bytes. One OTLP Span is one logical Span and one OTLP LogRecord is one logical Event; Resource/Scope envelopes are not count units. Each request is homogeneous by signal, exact profile version, and Workflow family/schema group. The decoded-record validator preserves native Span kind, timing, parent/link, flags, and Status in canonical identity; it accepts the byte count from the carrier adapter and never substitutes JSON fixture size. Per-record dispositions are Admission-internal. HTTP/OTLP responses use only signal-specific full success, partial success, or protobuf `Status`; transport refusal/timeout/tail loss/ambiguous commit are attempt/result state, never pseudo response payloads.

These are interchange/admission limits. Evidence storage schemas and migrations, production emitter/acceptor code, long-horizon capacity and cardinality tuning, latency, backpressure, security, retention duration, and operational SLOs remain owned by their downstream implementation issues. This package does not move those responsibilities into the Contract.

## Validation

```sh
npm install
npm test
npm run check -- --role producer
npm run check -- --role acceptor
```

Both roles deliberately run one closed oracle. A production implementation may claim conformance only after independently emitting or accepting the corpus through the same role interface and supplying the publication evidence required by the contract lifecycle. Passing this reference validator alone is not cross-implementation conformance.

Version `1.0.0` is the first frozen release. The Super Project release binds exact revisions and SHA-256 digests. SemVer never expands producer emission, acceptor admission, or conformance; only exact released tuples or explicit closed-matrix entries with fixtures and joint-gate evidence are supported.
