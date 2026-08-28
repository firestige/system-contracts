# Evaluation Metric Catalog 2.0 机器候选

本包从不可变的已发布 1.0.0 基线生成并测试独立的 `agentops.evaluation.metric-catalog@2.0.0` 评审候选。候选删除两项定义不清的 metric，并以精确的已记录 Usage 兼容规则替换三项 cost metric 中臆造的 cost-basis 语义。

它是评审候选，不是 publication record。`npm test` 会重新生成已检入的机器 artifact，并运行正例和 fail-closed 用例。相邻的 `evaluation` 已发布包不会被修改。

