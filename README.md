# system-contracts

English | [中文](README.zh-CN.md)

system-contracts holds the versioned shared contracts that define the boundary between the Execution and Evidence systems of workflow-self-recursive. It is the home for the technology-neutral fact meanings, the exact wire profile, the transport interaction rules, the human metric reading, and their machine-readable schemas, registries, fixtures, and validators.

The contract surface splits into four companions:

- **Observation Catalog** — the technology-neutral meaning of the Observation facts: fact classes, semantic owners, and identity / applicability / completeness / unit / privacy / relationship semantics.
- **OTel Observation Profile** — the exact wire mapping: pins, carriers, EventNames, the field registry, and complete record shapes.
- **Execution–Evidence Interaction Contract** — the transport obligations: ingest endpoint, per-record disposition, partial success, retry/timeout/ambiguous commit, and version compatibility.
- **Metric Catalog** — the human semantic authority for Evaluation metrics, encoded by the candidate machine representation under [`evaluation/`](evaluation/).

These four companions currently exist as `DRAFT_NOT_PUBLISHED` documents in the parent repository's `docs/contracts/`. Candidate machine representations now exist for Evaluation under [`evaluation/`](evaluation/), Observation under [`observation/`](observation/), and Workflow below; the interaction representation remains downstream work. None is physically published until the applicable evidence and publication gates are complete.

The **Workflow Contract DSL** current frozen release is `agentops.workflow-dsl@1.1.0`; its machine representation is maintained under [`workflow-dsl/`](workflow-dsl/). The separate [`delivery-admission/`](delivery-admission/) Contract deterministically freezes that author intent into the Runner activation projection without adding a Workflow Definition document or root schema.

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
- [Observation machine representation](observation/)
- [Evaluation Metric Catalog machine representation](evaluation/)
- [Conceptual architecture](https://github.com/firestige/workflow-self-recursive/blob/main/docs/agent-architecture.md)

## License

[Apache-2.0](LICENSE)
