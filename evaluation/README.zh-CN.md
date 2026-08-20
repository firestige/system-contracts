# Evaluation Metric Catalog——机器表示

[English](README.md) | [中文](README.zh-CN.md)

本目录包含 MVP 15-metric Evaluation Catalog 的 candidate machine representation。Semantic authority 仍是父仓库的 [`Metric Catalog`](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evaluation/metric-catalog.zh-CN.md)；本 representation 编码该文档，不得静默重定义它。

| 内容 | 路径 | 作用 |
| --- | --- | --- |
| JSON Schema | [`schemas/metric-catalog-0.1.0.schema.json`](schemas/metric-catalog-0.1.0.schema.json) | catalog、semantic-input registry 与 metric record 的 draft-07 structure contract |
| Normative example | [`examples/metric-catalog-0.1.0.json`](examples/metric-catalog-0.1.0.json) | 精确 15-metric MVP candidate instance |
| Validator | [`tools/check-catalog.cjs`](tools/check-catalog.cjs) | strict schema validation 加 catalog-wide identity、metric-set 与 input-reference closure check |
| Contract tests | [`tools/test-metric-catalog.cjs`](tools/test-metric-catalog.cjs) | 正例及 duplicate/missing/unresolved/zero/unexpected-set fail-closed mutation |

## 已编码约束

- 每个 metric 都有其 exact versioned `input_refs`；每个 reference 都解析到 catalog 的 closed `input_definitions` registry，checker 拒绝 missing、additional 或 reassigned input。
- `input_definitions` 区分 `observation`、`evaluation` 与 `projection` ownership。其 binding 始终是 `human-semantic-reference`：input reference 不是 OTel wire-field binding，也不授予 producer、provider 或 DSH authority。
- Checker 要求 `evaluation.definition` 声明的精确 15 个 metric ID，拒绝重复 metric/input ID，也拒绝缺失或意外 metric。
- `value_semantics.missing` 必须匹配 `N/A when …`；missing value 不能编码成 numeric 或 textual zero。
- Example 把全部 metric 标为 `planned`。Schema valid 与 `REVIEW_CANDIDATE` status 都不证明 implementation 或 physical conformance。
- Example 把 human `question_refs` 固定到 candidate reference version `0.1.0`。本目录不发布独立 Question Catalog；validator 只检查其 shape，其 semantics 仍是 human evaluation reference。

## 校验

```bash
npm ci
npm test
npm run check:example
```

测试从 normative example 创建隔离的 invalid mutation，并验证每项都因预期原因 fail closed。在仓库 publication gate 与 owner approval 完成前，本目录仍是 Contract candidate。
