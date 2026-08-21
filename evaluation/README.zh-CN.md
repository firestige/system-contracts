# Evaluation Metric Catalog——机器表示

[English](README.md) | [中文](README.zh-CN.md)

本目录包含 MVP 14-metric Evaluation Catalog 的 published machine representation。Semantic authority 仍是父仓库的 [`Metric Catalog`](https://github.com/firestige/workflow-self-recursive/blob/main/docs/contracts/evaluation/metric-catalog.zh-CN.md)；本 representation 编码该文档，不得静默重定义它。

| 内容 | 路径 | 作用 |
| --- | --- | --- |
| JSON Schema | [`schemas/metric-catalog-1.0.0.schema.json`](schemas/metric-catalog-1.0.0.schema.json) | catalog、semantic-input registry 与 metric record 的 draft-07 structure contract |
| Normative example | [`examples/metric-catalog-1.0.0.json`](examples/metric-catalog-1.0.0.json) | 精确 published 14-metric MVP instance 与 Observation dependency |
| Validator | [`tools/check-catalog.cjs`](tools/check-catalog.cjs) | strict schema validation 加 exact semantic digest、dependency、metric-set 与 input-reference closure check |
| Contract tests | [`tools/test-metric-catalog.cjs`](tools/test-metric-catalog.cjs) | 正例及 focused fail-closed structure/semantic-drift mutation |
| Fixture manifest | [`fixtures/cases-1.0.0.json`](fixtures/cases-1.0.0.json) | 一个 conforming case 加十八个 executable fail-closed JSON-Patch-style mutation |
| Version policy | [`VERSION_POLICY.md`](VERSION_POLICY.md) | exact first-release 与 compatibility boundary |
| Publication record | [`publication/publication-record-1.0.0.json`](publication/publication-record-1.0.0.json) | published exact artifact inventory 与 passed gate state |

## 已编码约束

- 每个 metric 都有其 exact versioned `input_refs`；每个 reference 都解析到 catalog 的 closed `input_definitions` registry，checker 拒绝 missing、additional 或 reassigned input。
- `input_definitions` 区分 `observation`、`evaluation` 与 `projection` ownership。其 binding 始终是 `human-semantic-reference`：input reference 不是 OTel wire-field binding，也不授予 producer、provider 或 DSH authority。
- Checker 要求 `evaluation.definition` 声明的精确 14 个 metric ID，拒绝重复 metric/input ID，也拒绝缺失或意外 metric。
- Exact published Observation `1.0.0` semantic revision、machine revision、publication digest 与 gitlink 均闭合；checker 对 package dependency fail closed 地解析。
- Coverage 始终报告 numerator、denominator、raw ratio、state 与 alert。Schema 固定 `0.10` default、`{0.00..0.99}` domain 与 exact cross-multiplication rule；coverage 绝不 gate publication。
- Formula、eligibility、exclusion、minimum-sample、coverage basis、kind、unit、missing semantics 与 semantic reference 都参与同一个 exact canonical catalog digest。
- `value_semantics.missing` 必须匹配 `N/A when …`；missing value 不能编码成 numeric 或 textual zero。
- Example 把全部 metric 标为 `planned`。Schema valid 与 `PUBLISHED` lifecycle status 都不证明 production implementation 或 physical conformance。
- Closed published surface 不存在 Question Catalog、`question_refs`、composite profile 或 `state` metric kind。

## 校验

```bash
npm ci
npm test
npm run check:example
npm run build:publication
```

测试从 normative example 创建隔离的 invalid mutation，并验证每项都因预期原因 fail closed。本 published package 仅作出 `VALIDATOR_ONLY` conformance claim；它不实现或认证 Projection、BI、Runtime、production execution 或 physical conformance。
