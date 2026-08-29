# Execution Provider Binding 2.0 候选

本包定义 machine-readable 候选：一个 WSR installation 可注册多个 exact Agent Provider factory，同时要求 Workflow 中每个 Agent-action Role 显式选择一个 Provider version 与一个 Provider-owned model coordinate。

Repository 文档固定为 `<canonical-worktree>/.wsr/role-provider-bindings.json`，closed binding 形状为 `{agentProvider:{identity,version},model:{provider,model}}`。不存在 installation default、Provider priority、ordered fallback、ambient discovery 或 admission 后重绑。binding 缺失、Provider 未知、版本不符或 capability 不兼容时，必须在 Runner effect 前失败。

Admission 把 factory version、invocation adapter key、canonical descriptor digest、required capabilities 与 model coordinate 冻结到每个 resolved Role。Recovery 只接受完全匹配的 registered descriptor，并且只为 persisted Manifest 实际包含的 Provider 启动 realm。Provider-native credential 与本机登录状态始终归 Provider 所有，不进入本包任何 schema 或 fixture。

运行 `npm test` 可验证 closed schema 与正负 corpus。本包仍是 review candidate，不改写已发布的 1.x contract。

[English](README.md)
