# Workflow DSL — machine representation（`system-contracts/workflow-dsl`）

本目录是 **Workflow Contract 的 DSL 面**的规范机器表示（`agentops.workflow-dsl@1.1.0`，FROZEN）。语义规范文档位于 super project 的 [`docs/contracts/workflow/workflow-definition-dsl.md`](../../docs/contracts/workflow/workflow-definition-dsl.md)。

| 内容 | 路径 | 说明 |
| --- | --- | --- |
| 规范 machine schemas | [`schemas/`](schemas/) | 9 个 JSON Schema（draft-07）：`agentops.meta` + Package、Snapshot 及 6 份 Definition companion 文档 |
| 最小 Definition 示例 | [`examples/minimal/`](examples/minimal/) | 覆盖 graph-level parallel、closed join、strict routing、typed event edges、Wait renewal、portable checkpoint、Package/Snapshot digest 与 exact authority binding |
| 结构校验器 | [`tools/check-example.cjs`](tools/check-example.cjs) | 严格校验 8 份 Package/Definition/Snapshot 文档，并检查 schema、graph/event、authority、resource、digest 与 Planner-cycle closure；不调度 Action |
| executable corpus | [`tools/run-conformance.cjs`](tools/run-conformance.cjs) | 对 `input + trace + oracle` fixture 执行 Planner classification、Wait correlation 与 closed reducer 三种最小 Contract 抽象 |
| authority 负向测试 | [`tools/test-authority-boundary.cjs`](tools/test-authority-boundary.cjs) | 验证空 Role boundary、未授权 Action Prompt、未绑定指令资源与错误资源 kind 全部 fail closed |
| machine contract 测试 | [`tools/test-workflow-dsl.cjs`](tools/test-workflow-dsl.cjs)、[`tools/test-wave6-contract.cjs`](tools/test-wave6-contract.cjs) | 固定 schema 集、最小正例，以及 parallel/event/Snapshot/Planner-cycle/closure 负向行为 |
| version / publication evidence | [`VERSION_POLICY.md`](VERSION_POLICY.md), [`publication/`](publication/) | first-release revision、legacy isolation、精确 artifact/consumer digest、gate 状态与 owner approval binding |

## 状态

- `FROZEN`，Contract revision `agentops.workflow-dsl@1.1.0`，按 [Contract Lifecycle Management](../../docs/contracts/contract-lifecycle.md) 管理（fast path §4.3）；machine representation 已发布。
- 当前 claim 仅为 `DEFINITION_AND_VALIDATOR_ONLY`：schemas、示例、fixtures、validators 与两套 first-party Definition 已通过发布门禁；没有 production Runtime conformance claim。

## 校验

```bash
npm ci
npm test
npm run check:minimal
npm run test:corpus
```

当前最小示例与负向测试集通过同一个 schema + closure checker；super project 另在锁定的 submodule revisions 上用该 checker 回归两个第一方 Definition。该结果证明已发布 Definition/validator surface 的 conformance，不构成 production Runtime conformance 声称。

## 边界

本 Contract 只拥有 Workflow 语义控制边界和精确资源 binding；model/tool/Driver/session 是 compatibility requirement，不是 authority grant。结构 checker 与 corpus runner 只验证 Contract 数据，不实现 scheduling、persistence、attempt lifecycle、retry engine、continuation store、provider adaptation、budget accounting 或 terminal settlement。`workflow-package/` 承载 portable Definition 及其资源，不承载 Contract 或生产 Runtime。
