# system-contracts

[English](README.md) | 中文

system-contracts 存放 workflow-self-recursive 中定义 Execution 与 Evidence 两个 System 之间边界的版本化共享契约。它是 technology-neutral fact meaning、exact wire profile、transport interaction rule、human metric reading 及其机器可读 schemas、registries、fixtures 与 validators 的归宿。

契约面包含这些 companion：

- **Observation Catalog** —— Observation 事实的 technology-neutral 含义：fact class、semantic owner，以及 identity / applicability / completeness / unit / privacy / relationship 语义。
- **OTel Observation Profile** —— exact wire mapping：pins、carriers、EventName、field registry 与 complete record shape。
- **Execution–Evidence Interaction Contract** —— transport 义务：ingest endpoint、per-record disposition、partial success、retry/timeout/ambiguous commit 与 version compatibility。
- **Metric Catalog** —— Evaluation metric 的 human semantic authority，由 [`evaluation/`](evaluation/) 下的 candidate machine representation 编码。
- **Evidence Query** —— frozen read-only Facts 与 Trace API Contract，由 [`evidence-query/`](evidence-query/) 编码。

Observation family 已发布为 Contract release `observation-contract@1.0.1`，同时保持 wire Profile `1.0.0`；原始 `1.0.0` publication 保持不可变且仍可解析。Evaluation、Workflow 与 `evidence.query@0.1.0` 也分别在 [`evaluation/`](evaluation/)、[`workflow-dsl/`](workflow-dsl/) 和 [`evidence-query/`](evidence-query/) 下提供 frozen machine release。各 release 的 exact binding 与 evidence 以对应 package 的 publication record 为准。

**Workflow Contract DSL** 当前 frozen release 为 `agentops.workflow-dsl@1.1.0`；其 machine representation 在 [`workflow-dsl/`](workflow-dsl/) 维护。独立的 [`delivery-admission/`](delivery-admission/) Contract 将该 author intent 确定性冻结为 Runner activation projection，且不增加 Workflow Definition document 或 root schema。

## Developer preview

本仓库是 workflow-self-recursive 架构优先开发者预览版的一部分，适用于个人或小团队的可信本地环境。Conformance claim 必须解析到 exact frozen publication record。Pre-1.0 与未来 major revision 可能包含 compatibility-breaking change。

## 获取源码

本仓库通常作为 [workflow-self-recursive](https://github.com/firestige/workflow-self-recursive) 的 submodule 使用：

```sh
git clone --recurse-submodules https://github.com/firestige/workflow-self-recursive.git
```

单独克隆：

```sh
git clone https://github.com/firestige/system-contracts.git
```

## 文档

- [Observation Catalog](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/observation/observation-catalog.zh-CN.md)
- [OTel Observation Profile](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/observation/otel-observation-profile.zh-CN.md)
- [Execution–Evidence Interaction Contract](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/execution-evidence/interaction-contract.zh-CN.md)
- [Metric Catalog](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evaluation/metric-catalog.zh-CN.md)
- [Evidence Query 契约](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evidence-query/evidence-query.zh-CN.md)
- [Observation 机器表示](observation/README.zh-CN.md)
- [Evaluation Metric Catalog 机器表示](evaluation/README.zh-CN.md)
- [Evidence Query 机器表示](evidence-query/README.zh-CN.md)
- [Workflow Definition DSL（中文翻译）](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/workflow/workflow-definition-dsl.zh-CN.md)
- [概念架构](https://github.com/firestige/workflow-self-recursive/blob/main/docs/agent-architecture.zh-CN.md)

## License

[Apache-2.0](LICENSE)
