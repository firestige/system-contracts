# Observation Task Binding 候选

本 sibling package 定义 `agentops.observation-profile@2.0.0` 的 Task declaration、Delivery membership 与直接 Delivery retention association 候选。它与 published `observation/` 分离，因后者的 publication inventory 已绑定该目录全部字节且保持不可变。

一条 admission-time `task.binding` log record 携带 exact Task/Delivery/Manifest identity、bounded canonical evidence-safe Manifest projection 及 digest。每个 resolved Role 投影同时包含 Role prompt、Agent Provider identity/version/adapter/descriptor digest、required capabilities 与 exact provider-owned model coordinate，使 Evidence 可归因于 admission 时冻结的多 Provider 绑定，而不从时间戳、arrival order 或 current runtime config 推断。

Profile 2 要求每个 supported Event/Span 直接携带 C01；accepted terminal `delivery.summary` projection time 是 Delivery TTL anchor。Observation failure 不改变 Delivery outcome。运行 `npm test` 验证该 review candidate。

[English](README.md)
