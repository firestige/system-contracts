# Workflow DSL 2.0 machine candidate

本包从不可变的 published `1.1.0` baseline 生成并测试独立的 `agentops.workflow-dsl@2.0.0` review candidate。生成后的 schema 保留 1.1 中未变化的语义，同时移除 Route `agent`、Route resource `model`、`agent-definition`/`model` resource kind，加入最多 128 个 Role 的边界，并强制同一 Role 只绑定一个 exact Role prompt。

它仍是 review candidate，不是 publication record。运行 `npm test` 会重新生成已纳入版本控制的 machine artifact，并执行 positive/negative conformance。相邻的 published `workflow-dsl` 包不会被修改。

Provider selection 仍不属于 Workflow author intent。Admission 汇总每个 Role 的 exact Route `capabilities`，并用该 requirement 校验 repository 中显式的 Role→Provider binding。Workflow 不声明 Provider priority、fallback、credential 或 model default。
