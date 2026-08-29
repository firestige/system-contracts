# system-contracts

English | [中文](README.zh-CN.md)

system-contracts holds the versioned shared contracts that define the boundary between the Execution and Evidence systems of workflow-self-recursive. It is the home for the technology-neutral fact meanings, the exact wire profile, the transport interaction rules, the human metric reading, and their machine-readable schemas, registries, fixtures, and validators.

The contract surface includes these companions:

- **Observation Catalog** — the technology-neutral meaning of the Observation facts: fact classes, semantic owners, and identity / applicability / completeness / unit / privacy / relationship semantics.
- **OTel Observation Profile** — the exact wire mapping: pins, carriers, EventNames, the field registry, and complete record shapes.
- **Execution–Evidence Interaction Contract** — the transport obligations: ingest endpoint, per-record disposition, partial success, retry/timeout/ambiguous commit, and version compatibility.
- **Metric Catalog** — the human semantic authority for Evaluation metrics, encoded by the candidate machine representation under [`evaluation/`](evaluation/).
- **Evidence Query** — the frozen read-only Facts and Trace API contract, encoded under [`evidence-query/`](evidence-query/).

The Observation family is published as Contract release `observation-contract@1.0.1` while retaining wire Profile `1.0.0`; its original `1.0.0` publication remains immutable and resolving. Evaluation, Workflow, and `evidence.query@0.1.0` also have frozen machine releases under [`evaluation/`](evaluation/), [`workflow-dsl/`](workflow-dsl/), and [`evidence-query/`](evidence-query/). See each package's publication record for its exact binding and evidence.

The **Workflow Contract DSL** current frozen release is `agentops.workflow-dsl@1.1.0`; its machine representation is maintained under [`workflow-dsl/`](workflow-dsl/). The separate [`delivery-admission/`](delivery-admission/) Contract deterministically freezes that author intent into the Runner activation projection without adding a Workflow Definition document or root schema.

The Iteration 6 [`execution-provider-binding/`](execution-provider-binding/) review candidate defines closed multi-Provider factory registration, exact repository Role bindings, admission-time frozen Provider/model identity, and fail-closed recovery. It does not modify published 1.x artifacts.

## Developer preview

This repository is part of workflow-self-recursive's architecture-first developer preview for trusted local use by individuals and small teams. Conformance claims must resolve an exact frozen publication record. Pre-1.0 and future major revisions may contain compatibility-breaking changes.

## Get the source

This repository is normally consumed as a submodule of [workflow-self-recursive](https://github.com/firestige/workflow-self-recursive):

```sh
git clone --recurse-submodules https://github.com/firestige/workflow-self-recursive.git
```

To clone it standalone:

```sh
git clone https://github.com/firestige/wsr-contracts.git
```

## Documentation

- [Observation Catalog](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/observation/observation-catalog.md)
- [OTel Observation Profile](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/observation/otel-observation-profile.md)
- [Execution–Evidence Interaction Contract](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/execution-evidence/interaction-contract.md)
- [Metric Catalog](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evaluation/metric-catalog.md)
- [Evidence Query Contract](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evidence-query/evidence-query.md)
- [Observation machine representation](observation/)
- [Evaluation Metric Catalog machine representation](evaluation/)
- [Evidence Query machine representation](evidence-query/)
- [Execution Provider Binding 2.0 candidate](execution-provider-binding/)
- [Conceptual architecture](https://github.com/firestige/workflow-self-recursive/blob/main/docs/agent-architecture.md)

## License

[Apache-2.0](LICENSE)
