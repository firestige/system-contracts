# Workflow DSL — machine representation（`system-contracts/workflow-dsl`）

本目录是 **Workflow Contract 的 DSL 面**的规范机器表示（`agentops.workflow-dsl@0.1.0`，REVIEW_CANDIDATE）。语义规范文档位于 super project 的 [`docs/contracts/workflow/workflow-definition-dsl.md`](../../docs/contracts/workflow/workflow-definition-dsl.md)。

| 内容 | 路径 | 说明 |
| --- | --- | --- |
| 规范 machine schemas | [`schemas/`](schemas/) | 8 个 JSON Schema（draft-07）：`agentops.meta` 共享定义 + 7 种文档 kind（package / workflow-definition / actions / roles / routes / artifacts / validation） |
| 最小 Definition 示例 | [`examples/minimal/`](examples/minimal/) | 覆盖 node/edge/conditional/state+reducer/checkpoint/Wait/recovery/terminal + Role route + owned/referenced；已通过机械闭包校验 |
| 示例校验器 | [`tools/check-example.cjs`](tools/check-example.cjs) | 先用 Ajv 严格编译 8 个 draft-07 schema 并校验全部 7 份文档，再执行 closure/reference/vocabulary/Action→Route、指令与 budget evaluator 精确 binding、`allowedSuccessors`==出边集、digest 与 forbidden-field 检查 |
| authority 负向测试 | [`tools/test-authority-boundary.cjs`](tools/test-authority-boundary.cjs) | 验证空 Role boundary、未授权 Action Prompt、未绑定指令资源与错误资源 kind 全部 fail closed |
| machine contract 测试 | [`tools/test-workflow-dsl.cjs`](tools/test-workflow-dsl.cjs) | 固定 schema 集、最小正例以及 closure/reference/vocabulary/evaluator/forbidden-field 负向行为 |

## 状态

- `REVIEW_CANDIDATE`，Contract revision `agentops.workflow-dsl@0.1.0`，按 [Contract Lifecycle Management](../../docs/contracts/contract-lifecycle.md) 管理（fast path §4.3）；**未发布**，任何实现不得声称 physical conformance（沿用 `concept.obligation.001` 诚实生命周期约定）。
- 发布 machine representation（schemas、示例、fixtures、validators）是下游义务；本目录当前只有 DSL 面的 schema 与示意示例（candidate material，非发布物）。

## 校验

```bash
npm ci
npm test
npm run check:minimal
```

当前最小示例与负向测试集通过同一个 schema + closure checker；super project 另在锁定的 submodule revisions 上用该 checker 回归两个第一方 Definition。该结果只证明 candidate machine surface 自洽；在 Contract publication gates 完成前，仍不构成已发布的 physical conformance 声称。

## 边界

本 Contract 只拥有 Workflow 语义控制边界和精确资源 binding；model/tool/Driver/session 是 compatibility requirement，不是 authority grant。DSH 或其他 selected Runtime 独占原生 tool visibility、授权提示、路径/网络/凭据 policy 与副作用执行。本 Contract 不定义 Provider authorization、RBAC、sandbox、Definition→Implementation 编译、builder/authoring 工具、LangGraph/Driver 原生 API、物理目录名或 Runtime 私有状态格式。`workflow-package/` 只承载可执行 Workflow 及其资源，不承载 Contract。
