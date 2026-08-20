# Observation Contract 候选版 1.0.0

[English](README.md) | 中文

本目录是 issue #42 的机器可读候选表示。它编码、但不取代父仓库 Observation Catalog、OTel Observation Profile 与 Execution–Evidence Interaction Contract 的语义权威。若 prose 与本 package 不一致，以最新产品决策及上述源文档为准，并修正候选表示。

本 package **尚未发布**，也**不声明生产实现 conformant**。标准化 JSON record schema 只用于解码后的测试表示，不是另一种 wire format。正式 carrier 仍是 OTLP binary protobuf：Span 使用 `ExportTraceServiceRequest`，Event 使用 `ExportLogsServiceRequest`。

## Contract 范围

- `registries/observation-profile-1.0.0.json` 固定 OTel `1.56.0`、OTLP/protobuf `1.10.0`、semantic conventions `1.41.1`、Scope/schema pin、十个 EventName，以及 closed 57 common + 10 Implementation + 6 System Design field。
- `schemas/` 定义严格的 Delivery Manifest、lifecycle result、decoded record、family、fixture case 与 publication record shape。
- `fixtures/` 覆盖正反 admission、base endpoint、multi-target Finding、duplicate/conflict、partial success、sampling、privacy、lineage、crash recovery、completeness、native usage 与 retention boundary。
- `tools/validator.cjs` 是共享语义 oracle；`tools/check-corpus.cjs` 让 producer 与 acceptor 对同一 corpus 执行验证。
- `publication/publication-record-1.0.0.json` 记录候选验证，状态保持 `REVIEW_CANDIDATE`、`published=false`、`conformance_claim=NONE`。

## 已固定的物理决策

Identifier 使用 printable ASCII `[A-Za-z0-9._:/@-]`，首字符为字母或数字，最长 128 字符。Finding summary 长度为 1–512 字符；超限必须拒绝，不能截断。逻辑 JSON object 的 digest 是 RFC 8785 JSON Canonicalization Scheme bytes 的 SHA-256 lowercase hex；byte artifact 则对 exact bytes 计算 SHA-256。

一次 admission batch 最多 512 records / 4 MiB exact OTLP protobuf request bytes。decoded-record validator 从 carrier adapter 接收该 byte count，不能用 JSON fixture size 替代。分页默认 100，最大 500。在单个 admitted batch 内，bounded-cardinality field 最多 256 个 distinct value，high-cardinality field 最多 512 个；low-cardinality field 使用 closed enum。默认 head-sampling probability 为 `1`。逐 record disposition 只在 Admission 内部存在；transport response 仅公开固定的 OTLP aggregate partial-success 形式。

这些是 interchange/admission limit。Evidence storage schema 与 migration、生产 emitter/acceptor、长期 capacity/cardinality tuning、latency、backpressure、security、retention duration 和 operational SLO 仍由相应下游实现 issue 负责；本 package 不把这些职责转移给 Contract。

## 验证

```sh
npm install
npm test
npm run check -- --role producer
npm run check -- --role acceptor
```

两个 role 刻意使用同一个 closed oracle。生产实现只有在通过同一 role interface 独立 emit 或 accept corpus，并提交 contract lifecycle 要求的发布证据后，才能声明 conformance。只通过 reference validator 不等于 cross-implementation conformance。

`1.0.0` 是当前第一轮迭代候选版。registry、shape、carrier、identity 或 truth 的 breaking change 必须升级 profile version；在发布前，保持 accepted meaning 的 fixture 或 validator 修正可以更新候选版。物理发布之前不提供 compatibility 承诺。
