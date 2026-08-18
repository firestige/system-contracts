# Workflow DSL — machine representation（`system-contracts/workflow-dsl`）

本目录是 **Workflow Contract 的 DSL 面**的规范机器表示（`agentops.workflow-dsl@0.1.0`，REVIEW_CANDIDATE）。语义规范文档位于 super project 的 [`docs/contracts/workflow/workflow-definition-dsl.md`](../../docs/contracts/workflow/workflow-definition-dsl.md)。

| 内容 | 路径 | 说明 |
| --- | --- | --- |
| 规范 machine schemas | [`schemas/`](schemas/) | 8 个 JSON Schema（draft-07）：`agentops.meta` 共享定义 + 7 种文档 kind（package / workflow-definition / actions / roles / routes / artifacts / validation） |
| 最小 Definition 示例 | [`examples/minimal/`](examples/minimal/) | 覆盖 node/edge/conditional/state+reducer/checkpoint/Wait/recovery/terminal + Role route + owned/referenced；已通过机械闭包校验 |
| 示例校验器 | [`tools/check-example.cjs`](tools/check-example.cjs) | 闭包检查：JSON/引用解析/词汇闭合/`allowedSuccessors`==出边集/digest 匹配/禁止物理字段扫描 |

## 状态

- `REVIEW_CANDIDATE`，Contract revision `agentops.workflow-dsl@0.1.0`，按 [Contract Lifecycle Management](../../docs/contracts/contract-lifecycle.md) 管理（fast path §4.3）；**未发布**，任何实现不得声称 physical conformance（沿用 `EE-OBL-001` 诚实生命周期约定）。
- 发布 machine representation（schemas、示例、fixtures、validators）是下游义务；本目录当前只有 DSL 面的 schema 与示意示例（candidate material，非发布物）。

## 校验

```bash
node tools/check-example.cjs examples/minimal   # 期望 PASS
```

## 边界

本 Contract 不定义：Definition→Implementation 编译、builder/authoring 工具、LangGraph/Driver 原生 API、物理目录名、Runtime 私有状态格式。`workflow-package/` 只承载可执行 Workflow 及其资源，不承载 Contract。
