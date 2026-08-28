# Workflow DSL 2.0 machine candidate

This package generates and tests a standalone `agentops.workflow-dsl@2.0.0` review candidate from the immutable published `1.1.0` baseline. The generated schemas retain unchanged 1.1 semantics while removing Route `agent`, Route resource `model`, and `agent-definition`/`model` resource kinds, adding the 128-Role bound, and enforcing one exact Role prompt per Role.

It is a review candidate, not a publication record. Run `npm test` to regenerate the checked-in machine artifacts and execute positive and negative conformance tests. The sibling `workflow-dsl` package is never modified.

Chinese companion: [`README.zh-CN.md`](README.zh-CN.md).
