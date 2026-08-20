# system-contracts

English | [中文](README.zh-CN.md)

system-contracts holds the versioned shared contracts that define the boundary between the Execution and Evidence systems of workflow-self-recursive. It is the home for the technology-neutral fact meanings, the exact wire profile, the transport interaction rules, the human metric reading, and their machine-readable schemas, registries, fixtures, and validators.

The contract surface splits into four companions:

- **Observation Catalog** — the technology-neutral meaning of the Observation facts: fact classes, semantic owners, and identity / applicability / completeness / unit / privacy / relationship semantics.
- **OTel Observation Profile** — the exact wire mapping: pins, carriers, EventNames, the field registry, and complete record shapes.
- **Execution–Evidence Interaction Contract** — the transport obligations: ingest endpoint, per-record disposition, partial success, retry/timeout/ambiguous commit, and version compatibility.
- **Metric Catalog** — the human reading of the machine metric catalog schema.

These four companions currently exist as `DRAFT_NOT_PUBLISHED` documents in the parent repository's `docs/contracts/`; publishing their machine representation (schemas, encoded registries, fixtures, and validators) is the downstream obligation `EE-OBL-001`.

A fifth contract surface is drafted for the **Workflow Contract DSL** (`agentops.workflow-dsl@0.1.0`, `DRAFT`): the semantic spec lives in the parent repository at [`docs/contracts/workflow/workflow-definition-dsl.md`](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/workflow/workflow-definition-dsl.md), and its machine representation (normative JSON Schemas, a minimal example Package, and an example closure checker) is maintained in this repository under [`workflow-dsl/`](workflow-dsl/). It is not published and proves no conformance.

## Developer preview

This repository is part of workflow-self-recursive's architecture-first developer preview for trusted local use by individuals and small teams. The contract drafts are meaning-stable but not physically published, so no implementation may claim conformance yet. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Get the source

This repository is normally consumed as a submodule of [workflow-self-recursive](https://github.com/firestige/workflow-self-recursive):

```sh
git clone --recurse-submodules https://github.com/firestige/workflow-self-recursive.git
```

To clone it standalone:

```sh
git clone https://github.com/firestige/system-contracts.git
```

## Documentation

- [Observation Catalog](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/observation/observation-catalog.md)
- [OTel Observation Profile](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/observation/otel-observation-profile.md)
- [Execution–Evidence Interaction Contract](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/execution-evidence/interaction-contract.md)
- [Metric Catalog](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evaluation/metric-catalog.md)
- [Conceptual architecture](https://github.com/firestige/workflow-self-recursive/blob/main/docs/agent-architecture.md)

## License

[Apache-2.0](LICENSE)
