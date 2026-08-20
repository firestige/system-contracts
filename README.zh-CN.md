# system-contracts

[English](README.md) | 中文

system-contracts 存放 workflow-self-recursive 中定义 Execution 与 Evidence 两个 System 之间边界的版本化共享契约。它是 technology-neutral fact meaning、exact wire profile、transport interaction rule、human metric reading 及其机器可读 schemas、registries、fixtures 与 validators 的归宿。

契约面拆分为四份 companion：

- **Observation Catalog** —— Observation 事实的 technology-neutral 含义：fact class、semantic owner，以及 identity / applicability / completeness / unit / privacy / relationship 语义。
- **OTel Observation Profile** —— exact wire mapping：pins、carriers、EventName、field registry 与 complete record shape。
- **Execution–Evidence Interaction Contract** —— transport 义务：ingest endpoint、per-record disposition、partial success、retry/timeout/ambiguous commit 与 version compatibility。
- **Metric Catalog** —— Evaluation metric 的 human semantic authority，由 [`evaluation/`](evaluation/) 下的 candidate machine representation 编码。

这四份 companion 目前以 `DRAFT_NOT_PUBLISHED` 状态存在于父仓库的 `docs/contracts/`。Evaluation surface 已在 [`evaluation/`](evaluation/) 下具有 candidate machine representation，Workflow surface 的 candidate 见下文；Observation 与 interaction representation 仍是 downstream work。在 applicable `concept.obligation.001` evidence 与 publication gate 完成前，任何一项都未 physical publish。

第五个契约面为 **Workflow Contract DSL**（`agentops.workflow-dsl@0.1.0`，`DRAFT`）草拟：语义规范位于父仓库 [`docs/contracts/workflow/workflow-definition-dsl.md`](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/workflow/workflow-definition-dsl.md)（中文翻译为 [`workflow-definition-dsl.zh-CN.md`](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/workflow/workflow-definition-dsl.zh-CN.md)），其 machine representation（规范 JSON Schema、最小示例 Package 与示例闭包校验器）在本仓库 [`workflow-dsl/`](workflow-dsl/) 维护。它尚未发布，不证明任何 conformance。

## Developer preview

本仓库是 workflow-self-recursive 架构优先开发者预览版的一部分，适用于个人或小团队的可信本地环境。契约草稿语义已稳定但尚未 physical publish，因此任何实现都还不能声称 conformance。**后续会有破坏兼容性的变更。**

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
- [Evaluation Metric Catalog 机器表示](evaluation/README.zh-CN.md)
- [Workflow Definition DSL（中文翻译）](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/workflow/workflow-definition-dsl.zh-CN.md)
- [概念架构](https://github.com/firestige/workflow-self-recursive/blob/main/docs/agent-architecture.zh-CN.md)

## License

[Apache-2.0](LICENSE)
