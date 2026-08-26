# Evidence Query 契约 0.1.0

[English](README.md) | 中文

本目录是 `evidence.query@0.1.0` 的 frozen machine-readable representation，精确绑定 Wave6 input manifest SHA-256 `e605720c5b225fa9228e2a4b1a8001f3235482ed83dc214e4c766e5caa6e1706`、Observation Profile `1.0.0`、read-model revision `1.0.0` 与 exact semantic publication record。

状态为 `FROZEN`，最大 claim 为 `VALIDATOR_ONLY`。仅通过 JSON Schema 绝不构成 production 或 cross-implementation conformance claim；实现仍须针对该精确 revision 证明自身 physical behavior。

## Surface

- `registries/evidence-query-0.1.0.json` closed routes、enum、projection ownership、compatibility dimension、expiry owner、policy default 与 exact source digest。
- `schemas/evidence-query-response-0.1.0.schema.json` closed Fact、Trace、envelope、truth、relationship 与 error JSON shape。
- `schemas/evidence-query-internal-1.0.0.schema.json` closed `SnapshotPage`、trace summary、`ExpiryOwner`、`ExpiryRecord`、`ExpiryBatch` 与 `ExpiryResult`。
- `tools/validator.cjs` 检查 JSON Schema 无法表达的 projection tuple、relationship endpoint、expiry compatibility order、trace aggregation、request/error classification、LINK identity、batch selection 与 canonical digest bytes。
- `fixtures/{positive,negative,recovery}` 与 `examples/` 是 executable candidate corpus。
- `publication/publication-candidate-0.1.0.json` 是 immutable qualified RC input，并作为 `published=false` 的历史证据保留。
- `publication/publication-record-0.1.0.json` 绑定 frozen semantic companion、qualified RC、最终 machine inventory、全部六项 gate 与 owner approval。

## 验证

```sh
npm ci
npm test
npm run check
npm run build:publication
npm test
```

Package byte 不变时，`build:publication` 会确定性重新生成 frozen publication record。qualified candidate record 永不重新生成或覆盖。

Validator 消费 Wave6 manifest 指定的 exact published Observation registry/schema/validator coordinates；不暴露 Raw data、SQL/storage shape、projection-effect name、credential 或 write interface。
