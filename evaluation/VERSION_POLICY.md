# Evaluation Metric Catalog version policy

The current first-release candidate is `agentops.evaluation.metric-catalog@1.0.0`. It preserves the 15-metric meaning closed by issue #43 and the machine closure from issue #44; the version change is the lifecycle-required first frozen-version boundary, not a metric, formula, eligibility, or input-set change.

Metric Catalog `0.1.0` is `NON_RESOLVING_LEGACY_HISTORY_ONLY`. It remains available only through Git history and must not be selected, resolved, advertised as current, or accepted by a `1.0.0` consumer.

- PATCH: non-semantic text or validator corrections that preserve accepted meaning.
- MINOR: backward-compatible optional representation additions that do not alter any metric meaning, formula, eligibility, or input set.
- MAJOR: metric addition/removal, formula, eligibility, value semantics, question binding, or closed input-set changes; it restarts the full Contract lifecycle.
- Metric, question, schema, example, fixture and package revisions bind exactly to `1.0.0`; compatibility is never inferred from matching identifiers.

Until contract.gate.1–contract.gate.6 and `evidence-governance-owner` approval pass, `1.0.0` remains `REVIEW_CANDIDATE`, is not published, and admits no BI or implementation conformance claim.
