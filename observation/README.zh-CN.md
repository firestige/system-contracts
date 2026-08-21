# Observation Contract 候选版 1.0.0

[English](README.md) | 中文

本目录是 issue #42 的机器可读候选表示。它编码、但不取代父仓库 Observation Catalog、OTel Observation Profile 与 Execution–Evidence Interaction Contract 的语义权威。若 prose 与本 package 不一致，以最新产品决策及上述源文档为准，并修正候选表示。

本 package **尚未发布**，也**不声明生产实现 conformant**。标准化 JSON record schema 只用于解码后的测试表示，不是另一种 wire format。正式 carrier 仍是在一个 loopback base URL 上使用 OTLP binary protobuf：Span 的 `ExportTraceServiceRequest` 位于 `/v1/traces`，Event 的 `ExportLogsServiceRequest` 位于 `/v1/logs`。

## Contract 范围

- `registries/observation-profile-1.0.0.json` 固定 pin、十个 EventName、73 个 field，以及每个 field 的 closed carrier/EventName placement 与 requiredness；`compatibility-matrix-1.0.0.json` 列出 exact supported producer/acceptor/profile/family tuple，其他组合默认 fail closed。
- `schemas/` 定义严格的 Delivery Manifest、lifecycle result、decoded record、interaction、compatibility matrix、family、fixture case 与 publication record shape。
- `fixtures/` 还包含 official Trace/Log protobuf bytes，以及 signal-specific full、mixed、all-rejected、retry、refusal、timeout、tail-loss 与 ambiguous-commit interaction case。
- `tools/validator.cjs` 是共享语义 oracle；`tools/decode-otlp-protobuf.cjs` 校验 official protobuf fixture；`tools/check-corpus.cjs` 让 producer 与 acceptor 对同一 corpus 执行验证。
- `publication/publication-record-1.0.0.json` 记录候选验证，状态保持 `REVIEW_CANDIDATE`、`published=false`、`conformance_claim=NONE`。

## 已固定的物理决策

Identifier 使用 printable ASCII `[A-Za-z0-9._:/@-]`，首字符为字母或数字，最长 128 字符。Finding summary 长度为 1–512 字符；超限必须拒绝，不能截断。逻辑 JSON object 的 digest 是 RFC 8785 JSON Canonicalization Scheme bytes 的 SHA-256 lowercase hex；byte artifact 则对 exact bytes 计算 SHA-256。

一次 admission batch 最多 512 个 logical record / 4 MiB exact OTLP protobuf request bytes。一个 OTLP Span 是一个 logical Span，一个 OTLP LogRecord 是一个 logical Event；Resource/Scope envelope 不是 count unit。decoded-record validator 从 carrier adapter 接收 byte count，不能用 JSON fixture size 替代。逐 record disposition 只在 Admission 内部存在。HTTP/OTLP response 只使用 signal-specific full success、partial success 或 protobuf `Status`；transport refusal/timeout/tail loss/ambiguous commit 是 attempt/result state，绝不是 pseudo response payload。

这些是 interchange/admission limit。Evidence storage schema 与 migration、生产 emitter/acceptor、长期 capacity/cardinality tuning、latency、backpressure、security、retention duration 和 operational SLO 仍由相应下游实现 issue 负责；本 package 不把这些职责转移给 Contract。

## 验证

```sh
npm install
npm test
npm run check -- --role producer
npm run check -- --role acceptor
```

两个 role 刻意使用同一个 closed oracle。生产实现只有在通过同一 role interface 独立 emit 或 accept corpus，并提交 contract lifecycle 要求的发布证据后，才能声明 conformance。只通过 reference validator 不等于 cross-implementation conformance。

`1.0.0` 是当前第一轮迭代候选版。Super Project release 将绑定 exact revision 与 SHA-256 digest。SemVer 绝不扩大 producer emission、acceptor admission 或 conformance；只有 exact released tuple，或带 fixture 与 joint-gate evidence 的 explicit closed-matrix entry 才受支持。
